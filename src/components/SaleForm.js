import React, { useState } from 'react';
import { TextField, Button, Grid, Paper, Typography, Select, MenuItem, FormControl, InputLabel, Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper as TablePaper, Dialog, DialogTitle, DialogContent, IconButton, CircularProgress, TablePagination } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import SuccessModal from './SuccessModal';
import { formatTireLabel } from '../lib/tireIdentity';
import { downloadExcel, datedName, money } from '../lib/documents';
import { getCurrency } from '../lib/settings';

function SaleForm(props) {
  const { tires = [], addSale, onDeleteSale } = props;
  const parentHistory = props.salesHistory;
  const [sale, setSale] = useState({
    tireId: '',
    quantity: '',
    price: '',
    date: '',
    customerName: ''
  });
  // Single source of truth: parent App.sales when provided, local fallback otherwise.
  const [localHistory, setLocalHistory] = useState([]);
  const history = Array.isArray(parentHistory) ? parentHistory : localHistory;
  const [openHistory, setOpenHistory] = useState(false);
  const [filterCriteria, setFilterCriteria] = useState('customerName');
  const [filterValue, setFilterValue] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [successData, setSuccessData] = useState({ title: '', message: '', details: [] });
  const [histPage, setHistPage] = useState(0);
  const [histRowsPerPage, setHistRowsPerPage] = useState(10);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'tireId') {
      const selectedTire = (tires || []).find((tire) => String(tire?.id) === String(value));
      // Guard find mismatch: if not found, return early without crashing
      if (!selectedTire) {
        setSale((prev) => ({ ...prev, tireId: value }));
        return;
      }
      // Default to RETAIL list price only — never to `price` (wholesale cost).
      // `price` is the cost basis (App.js addTire); prefilling it would
      // undercharge and zero out profit. Leave empty when no retail is set
      // so the user must enter a real sale price.
      const hasRetail =
        selectedTire?.retailPrice !== undefined &&
        selectedTire?.retailPrice !== null &&
        selectedTire?.retailPrice !== '';
      const retail = hasRetail ? selectedTire.retailPrice : '';
      setSale((prev) => ({ ...prev, tireId: value, price: retail }));
    } else {
      setSale((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    const selectedTire = (tires || []).find((tire) => String(tire?.id) === String(sale.tireId));
    if (!selectedTire) {
      setError('Please select a valid tire.');
      return;
    }

    const quantity = Number(sale.quantity);
    const price = Number(sale.price);

    if (!Number.isInteger(quantity) || quantity < 1) {
      setError('Quantity must be an integer of at least 1.');
      return;
    }
    if (quantity > Number(selectedTire?.stock || 0)) {
      setError('Quantity cannot exceed available stock.');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setError('Price must be a number greater than or equal to 0.');
      return;
    }
    // Guard against silently selling at/below wholesale cost.
    const costBasisRaw =
      selectedTire?.costPrice !== undefined &&
      selectedTire?.costPrice !== null &&
      selectedTire?.costPrice !== ''
        ? selectedTire.costPrice
        : selectedTire?.price;
    const costBasis = Number(costBasisRaw);
    if (Number.isFinite(costBasis) && price < costBasis) {
      const cur = selectedTire?.currency === 'USD' ? 'USD' : 'TZS';
      setError(
        `Sale price (${price} ${cur}) is below wholesale cost (${costBasis} ${cur}). Adjust the price or update the tire's retail price.`
      );
      return;
    }

    // Coerce numbers; default date to today so Dashboard charts always have a date.
    const coercedSale = {
      ...sale,
      quantity,
      price,
      date: sale.date || new Date().toISOString().slice(0, 10),
    };
    setIsSaving(true);
    setTimeout(() => {
      if (typeof addSale === 'function') {
        addSale(coercedSale);
      } else {
        setLocalHistory((prev) => [...(prev || []), coercedSale]);
      }
      setSale({ tireId: '', quantity: '', price: '', date: '', customerName: '' });
      setIsSaving(false);
      const tireLabel = formatTireLabel(selectedTire);
      setSuccessData({
        title: 'Sale Recorded',
        message: 'The sale has been recorded successfully.',
        details: [
          { label: 'Tire', value: tireLabel },
          { label: 'Customer', value: coercedSale.customerName || '' },
          { label: 'Quantity', value: String(coercedSale.quantity) },
          { label: 'Total', value: `${Number(coercedSale.price || 0) * Number(coercedSale.quantity || 0)} ${selectedTire?.currency === 'USD' ? 'USD' : 'TZS'}` }
        ]
      });
      setSuccessOpen(true);
    }, 500);
  };

  const handleOpenHistory = () => setOpenHistory(true);
  const handleCloseHistory = () => setOpenHistory(false);

  const handleVoidSale = (saleItem) => {
    if (typeof onDeleteSale !== 'function') {
      setError('Voiding sales is unavailable here.');
      return;
    }
    const ok =
      typeof window === 'undefined' ||
      window.confirm(
        `Void this sale (${saleItem?.quantity ?? ''} pcs${saleItem?.customerName ? ` — ${saleItem.customerName}` : ''})? Stock will be restored and the ledger entry reversed.`
      );
    if (ok) onDeleteSale(saleItem?.id);
  };

  const handleExportToExcel = () => {
    const rows = (history || []).map((saleItem) => {
      const tire = (tires || []).find((t) => String(t?.id) === String(saleItem?.tireId));
      const cur = tire?.currency || getCurrency();
      const qty = Number(saleItem?.quantity || 0);
      const price = Number(saleItem?.price || 0);
      return {
        Date: saleItem?.date || '',
        'Customer Full Name': saleItem?.customerName || '',
        Brand: tire?.brand || 'N/A',
        Size: tire?.size || 'N/A',
        'Sale Quantity': qty,
        'Unit Price': price,
        Currency: cur,
        Total: qty * price,
        'Total (formatted)': money(qty * price, cur),
      };
    });
    downloadExcel(
      datedName("sales_history", "xlsx"),
      "Sales History",
      rows,
      [12, 24, 18, 14, 14, 12, 10, 14, 20]
    );
  };

  const filteredSales = (history || []).filter((saleItem) => {
    const tire = (tires || []).find((t) => String(t?.id) === String(saleItem?.tireId));
    const query = (filterValue || '').toLowerCase();
    switch (filterCriteria) {
      case 'customerName':
        return (saleItem?.customerName || '').toLowerCase().includes(query);
      case 'brand':
        return (tire?.brand || '').toLowerCase().includes(query);
      case 'size':
        return (tire?.size || '').toLowerCase().includes(query);
      case 'price':
        return (saleItem?.price ?? '').toString().includes(filterValue || '');
      case 'date':
        return (saleItem?.date || '').includes(filterValue || '');
      default:
        return true;
    }
  });

  return (
    <div>
      <Paper elevation={3} style={{ padding: '20px', marginBottom: '20px' }}>
        <Typography variant="h6" gutterBottom color="primary">
          Make Sale
        </Typography>
        {error && (
          <Typography variant="body2" color="error" style={{ marginBottom: '12px' }}>
            {error}
          </Typography>
        )}
        <form onSubmit={handleSubmit}>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <FormControl fullWidth variant="outlined">
                <InputLabel>Tire</InputLabel>
                <Select
                  name="tireId"
                  value={sale.tireId}
                  onChange={handleChange}
                  required
                  label="Tire"
                >
                  {(tires || []).map((tire) => (
                    <MenuItem key={tire?.id} value={tire?.id}>
                      {formatTireLabel(tire, { withStock: true })}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth name="quantity" label="Sale Quantity" type="number" value={sale.quantity} onChange={handleChange} required variant="outlined" inputProps={{ min: 1, step: 1 }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth name="price" label="Sale Price (retail default)" type="number" value={sale.price} onChange={handleChange} required variant="outlined" inputProps={{ min: 0, step: 'any' }} helperText={(() => {
                const t = (tires || []).find((x) => String(x?.id) === String(sale.tireId));
                if (!t) return "Select a tire to see cost / margin";
                const cur = t?.currency === 'USD' ? 'USD' : 'TZS';
                const cost = Number(t.costPrice !== undefined && t.costPrice !== '' ? t.costPrice : t.price) || 0;
                const sp = Number(sale.price);
                if (!Number.isFinite(sp)) return `Cost: ${cost.toFixed(2)} ${cur}`;
                const q = Number(sale.quantity) || 0;
                return `Cost: ${cost.toFixed(2)} ${cur} · Margin: ${((sp - cost) * (q || 1)).toFixed(2)} ${cur}${q ? ` on ${q} pcs` : ' per pc'}`;
              })()} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth name="date" label="Date" type="date" value={sale.date} onChange={handleChange} required variant="outlined" InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth name="customerName" label="Customer Full Name" value={sale.customerName} onChange={handleChange} required variant="outlined" />
            </Grid>
            <Grid item xs={12}>
              <Box display="flex" justifyContent="flex-end">
                <Button type="submit" variant="contained" style={{ marginRight: '10px' }} disabled={isSaving}>
                  {isSaving ? <CircularProgress size={24} color="inherit" /> : 'Make Sale'}
                </Button>
                <Button variant="contained" onClick={handleOpenHistory}>
                  Sales History
                </Button>
              </Box>
            </Grid>
          </Grid>
        </form>
      </Paper>

      <Dialog open={openHistory} onClose={handleCloseHistory} fullWidth maxWidth="md">
        <DialogTitle>
          Sales History
          <IconButton
            edge="end"
            color="inherit"
            onClick={handleCloseHistory}
            aria-label="close"
            style={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} style={{ marginBottom: '20px' , marginTop: '1px'}}>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth variant="outlined">
              <InputLabel>Filter Criteria</InputLabel>
                <Select
                  value={filterCriteria}
                  onChange={(e) => setFilterCriteria(e.target.value)}
                  label="Filter Criteria"
                >
                  <MenuItem value="customerName">Customer Full Name</MenuItem>
                  <MenuItem value="brand">Brand</MenuItem>
                  <MenuItem value="size">Size</MenuItem>
                  <MenuItem value="price">Price</MenuItem>
                  <MenuItem value="date">Date</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={`${filterCriteria === 'customerName' ? 'Customer Full Name' : filterCriteria === 'brand' ? 'Brand' : filterCriteria === 'size' ? 'Size' : filterCriteria === 'price' ? 'Price' : 'Date'}`}
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
                variant="outlined"
              />
            </Grid>
          </Grid>
          <Button variant="contained" color="primary" onClick={handleExportToExcel} style={{ marginBottom: '20px' }}>
            Download Excel
          </Button>
          <TableContainer component={TablePaper} sx={{ overflowX: "auto" }}>
            <Table stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Customer Full Name</TableCell>
                  <TableCell>Brand</TableCell>
                  <TableCell>Size</TableCell>
                  <TableCell>Sale Quantity</TableCell>
                  <TableCell>Sale Price</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredSales.length > 0 ? (
                  filteredSales.slice(histPage * histRowsPerPage, histPage * histRowsPerPage + histRowsPerPage).map((saleItem, index) => {
                    const tire = (tires || []).find((t) => String(t?.id) === String(saleItem?.tireId));
                    return (
                      <TableRow key={index}>
                        <TableCell>{saleItem?.date || ''}</TableCell>
                        <TableCell>{saleItem?.customerName || ''}</TableCell>
                        <TableCell>{tire?.brand || 'N/A'}</TableCell>
                        <TableCell>{tire?.size || 'N/A'}</TableCell>
                        <TableCell>{saleItem?.quantity ?? ''}</TableCell>
                        <TableCell>{saleItem?.price ?? ''}</TableCell>
                        <TableCell>
                          <IconButton
                            aria-label="void sale"
                            size="small"
                            color="error"
                            title="Void sale (restores stock, reverses ledger)"
                            onClick={() => handleVoidSale(saleItem)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} style={{ textAlign: 'center' }}>No data found</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <TablePagination
              component="div"
              count={filteredSales.length}
              page={histPage}
              rowsPerPage={histRowsPerPage}
              onPageChange={(_, p) => setHistPage(p)}
              onRowsPerPageChange={(e) => { setHistRowsPerPage(Number(e.target.value)); setHistPage(0); }}
              rowsPerPageOptions={[5, 10, 25]}
            />
          </TableContainer>
        </DialogContent>
      </Dialog>
      <SuccessModal
        open={successOpen}
        onClose={() => setSuccessOpen(false)}
        title={successData.title || 'Sale Recorded'}
        message={successData.message}
        details={successData.details}
        actionLabel="Done"
      />
    </div>
  );
}

export default SaleForm;
