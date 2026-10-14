import React, { useState, useRef, useMemo, useCallback } from 'react';
import {
  TextField, List, ListItemText, ListItemAvatar,
  Avatar, Paper, Typography, Dialog, DialogTitle, DialogContent,
  IconButton, Tooltip, Snackbar, Button, Box, Grid, Select,
  MenuItem, FormControl, InputLabel,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, Chip,
  CircularProgress
} from '@mui/material';
import { styled } from '@mui/material/styles';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import Carousel from 'react-material-ui-carousel';
import ShareIcon from '@mui/icons-material/Share';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import QrCodeIcon from '@mui/icons-material/QrCode';
import HistoryIcon from '@mui/icons-material/History';
import GetAppIcon from '@mui/icons-material/GetApp';
import ListItem from '@mui/material/ListItem';

import html2canvas from 'html2canvas';
import QRCode from 'qrcode.react';
import { downloadExcel, datedName } from '../lib/documents';
import './i18n';
import SuccessModal from './SuccessModal';
import { getLowStockThreshold, getCurrency, formatMoney, currencySymbol } from '../lib/settings';
import {
  formatTireLabel, validateSku, validateBarcode, validateDot, validateSupplier, isDuplicateSku,
  normalizeSku, normalizeSize, canonicalBrand, uniqueOptions, findDuplicateTire,
  TIRE_BRANDS,
} from '../lib/tireIdentity';


const StyledPaper = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(3),
  borderRadius: 16,
  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
}));

const StyledDialog = styled(Dialog)(({ theme }) => ({
  '& .MuiDialog-paper': {
    borderRadius: 16,
    boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)',
  },
}));

const StyledDialogTitle = styled(DialogTitle)(({ theme }) => ({
  background: '#343a40',
  color: '#ffffff',
  padding: theme.spacing(2),
}));

const StyledDialogContent = styled(DialogContent)(({ theme }) => ({
  padding: theme.spacing(3),
}));

const ShareableContent = styled(Box)(({ theme }) => ({
  width: '100%',
  maxWidth: '600px',
  padding: theme.spacing(2),
  borderRadius: '8px',
  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
}));

const StyledListItem = styled(ListItem)(({ theme }) => ({
  borderRadius: 8,
  marginBottom: theme.spacing(1),
  '&:hover': {
    backgroundColor: theme.palette.action.hover,
  },
}));

function TireList({ tires = [], setTires, sales = [], addSale, onAddNew, onUpdateTire, onDeleteTire, onDeleteSale }) {
  const [filter, setFilter] = useState('');
  const [scanCode, setScanCode] = useState('');
  const [selectedTire, setSelectedTire] = useState(null);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [sortBy, setSortBy] = useState('brand');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const lowStockThreshold = getLowStockThreshold();
  const [showQRCode, setShowQRCode] = useState(false);
  const [showSalesHistory, setShowSalesHistory] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editError, setEditError] = useState('');
  const shareableContentRef = useRef(null);
  const [showSalesForm, setShowSalesForm] = useState(false);
  const [saleDate, setSaleDate] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [saleQuantity, setSaleQuantity] = useState(1);
  const [editForm, setEditForm] = useState({ brand: '', size: '', year: '', season: '', vehicleType: '', costPrice: '', retailPrice: '', stock: '', location: '', dotCode: '', loadIndex: '', condition: 'New', sku: '', barcode: '', supplier: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [successData, setSuccessData] = useState({ title: '', message: '', details: [] });

  const brandOptions = useMemo(() => {
    const existingBrands = (tires || []).map((t) => t?.brand).filter(Boolean);
    return uniqueOptions(TIRE_BRANDS, existingBrands);
  }, [tires]);

  const getCost = (t) => {
    const raw = t && t.costPrice !== undefined && t.costPrice !== '' ? t.costPrice : t?.price;
    const n = Number(raw);
    return Number.isNaN(n) ? 0 : n;
  };
  // Display helper: returns NaN when no explicit retail is set (never falls
  // back to wholesale cost — cost !== retail). Callers render '—' for NaN.
  const getRetail = (t) => {
    const hasRetail =
      t && t.retailPrice !== undefined && t.retailPrice !== null && t.retailPrice !== '';
    if (!hasRetail) return NaN;
    const n = Number(t.retailPrice);
    return Number.isFinite(n) ? n : NaN;
  };
  const curOf = (t) => (t?.currency ? t.currency : getCurrency());
  const fmtRetail = (t) => {
    const r = getRetail(t);
    return Number.isFinite(r) ? formatMoney(r, curOf(t)) : '— (set retail price)';
  };


  const filteredAndSortedTires = useMemo(() => {
    const list = tires || [];
    const query = (filter || '').toLowerCase();
    return [...list]
      .filter((tire) =>
        (tire?.brand || '').toLowerCase().includes(query) ||
        (tire?.size || '').toLowerCase().includes(query) ||
        (tire?.season || '').toLowerCase().includes(query) ||
        (tire?.location || '').toLowerCase().includes(query) ||
        (tire?.supplier || '').toLowerCase().includes(query) ||
        (tire?.sku || '').toLowerCase().includes(query) ||
        String(tire?.id || '').toLowerCase().includes(query)
      )
      .sort((a, b) => {
        if (sortBy === 'price' || sortBy === 'year' || sortBy === 'stock') {
          const av = sortBy === 'price' ? getCost(a) : (Number(a?.[sortBy]) || 0);
          const bv = sortBy === 'price' ? getCost(b) : (Number(b?.[sortBy]) || 0);
          return av - bv;
        }
        const aVal = (a?.[sortBy] ?? '').toString();
        const bVal = (b?.[sortBy] ?? '').toString();
        return aVal.localeCompare(bVal);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tires, filter, sortBy]);

  const handleTireClick = useCallback((tire) => {
    setSelectedTire(tire);
    // Pre-fill sale price with RETAIL only — never `price` (wholesale cost).
    const retail = (() => {
      const hasRetail =
        tire && tire.retailPrice !== undefined && tire.retailPrice !== null && tire.retailPrice !== '';
      if (!hasRetail) return '';
      const n = Number(tire.retailPrice);
      return Number.isFinite(n) ? String(n) : '';
    })();
    setSalePrice(retail);
    setEditMode(false);
    setEditError('');
    setShowQRCode(false);
    setShowSalesHistory(false);
  }, []);

  const handleScan = useCallback(() => {
    const code = String(scanCode || '').trim();
    if (!code) return;
    // Compact QR format is `TIRE:<id>`; accept raw uuid too.
    let id = code;
    const m = code.match(/TIRE:(.+)/i);
    if (m) id = m[1].trim();
    const found = (tires || []).find(
      (t) => String(t?.id) === String(id) || String(t?.id).toLowerCase() === id.toLowerCase()
    );
    if (found) {
      setSelectedTire(found);
      const hasRetail =
        found && found.retailPrice !== undefined && found.retailPrice !== null && found.retailPrice !== '';
      const n = hasRetail ? Number(found.retailPrice) : NaN;
      setSalePrice(Number.isFinite(n) ? String(n) : '');
      setEditMode(false);
      setEditError('');
      setShowQRCode(false);
      setShowSalesHistory(false);
      setSnackbarMessage(`Found: ${found.brand || ''} ${found.size || ''}`);
      setSnackbarOpen(true);
    } else {
      setSnackbarMessage('No tire matches that code.');
      setSnackbarOpen(true);
    }
  }, [scanCode, tires]);

  const handleClose = useCallback(() => {
    setSelectedTire(null);
    setEditMode(false);
    setShowQRCode(false);
    setShowSalesHistory(false);
    setShowSalesForm(false);
  }, []);

  const handleShare = useCallback(async () => {
    if (selectedTire && shareableContentRef.current) {
      if (!salePrice) {
        setSnackbarMessage('Please enter the sale price.');
        setSnackbarOpen(true);
        return;
      }

      try {
        const canvas = await html2canvas(shareableContentRef.current, {
          scale: 2,
          logging: false,
          useCORS: true,
          allowTaint: true,
        });

        canvas.toBlob((blob) => {
          const item = new ClipboardItem({ "image/png": blob });
          navigator.clipboard.write([item]).then(() => {
            setSnackbarMessage('Tire details copied to clipboard!');
            setSnackbarOpen(true);
          });
        });
      } catch (error) {
        console.error('An error occurred while sharing:', error);
        setSnackbarMessage('An error occurred while sharing.');
        setSnackbarOpen(true);
      }
    }
  }, [selectedTire, salePrice]);

  const exportToExcel = useCallback(() => {
    // Flat columns including warehouse / spec fields.
    // NOTE: retail falls back to '' (not cost) so exports never masquerade
    // wholesale cost as the list price.
    const rows = (tires || []).map((t) => {
      const costRaw = t?.costPrice !== undefined && t?.costPrice !== '' && t?.costPrice !== null ? Number(t.costPrice) : Number(t?.price);
      const retailRaw = t?.retailPrice !== undefined && t?.retailPrice !== '' && t?.retailPrice !== null ? Number(t.retailPrice) : NaN;
      return {
        Brand: t?.brand || '',
        Size: t?.size || '',
        Season: t?.season || '',
        Year: t?.year ?? '',
        Stock: Number(t?.stock) || 0,
        Currency: t?.currency || getCurrency(),
        'Cost Price': Number.isFinite(costRaw) ? costRaw : 0,
        'Retail Price': Number.isFinite(retailRaw) ? retailRaw : '',
        Location: t?.location || '',
        'DOT Code': t?.dotCode || '',
        'Load Index': t?.loadIndex || '',
        Condition: t?.condition || 'New',
        Supplier: t?.supplier || '',
        SKU: t?.sku || '',
        Barcode: t?.barcode || '',
      };
    });
    downloadExcel(
      datedName("tire_inventory", "xlsx"),
      "Tires",
      rows,
      [18, 14, 12, 8, 8, 10, 12, 12, 16, 10, 12, 12, 22, 16, 20]
    );
  }, [tires]);

  const handleEdit = useCallback(() => {
    if (!selectedTire) return;
    const cost = selectedTire?.costPrice !== undefined && selectedTire?.costPrice !== '' && selectedTire?.costPrice !== null ? selectedTire.costPrice : (selectedTire?.price ?? '');
    // Leave retail empty when unset so validation forces an explicit value
    // instead of silently copying cost.
    const hasRetail = selectedTire?.retailPrice !== undefined && selectedTire?.retailPrice !== '' && selectedTire?.retailPrice !== null;
    const retail = hasRetail ? selectedTire.retailPrice : '';
    setEditForm({
      brand: selectedTire?.brand || '',
      size: selectedTire?.size || '',
      year: selectedTire?.year ?? '',
      season: selectedTire?.season || '',
      vehicleType: selectedTire?.vehicleType || '',
      costPrice: cost ?? '',
      retailPrice: retail ?? '',
      stock: selectedTire?.stock ?? '',
      location: selectedTire?.location || '',
      dotCode: selectedTire?.dotCode || '',
      loadIndex: selectedTire?.loadIndex || '',
      condition: selectedTire?.condition || 'New',
      supplier: selectedTire?.supplier || '',
      sku: selectedTire?.sku || '',
      barcode: selectedTire?.barcode || '',
    });
    setEditError('');
    setEditMode(true);
  }, [selectedTire]);

  const handleEditFieldChange = useCallback((e) => {
    const { name, value } = e.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
  }, []);

  const validateEditForm = (form) => {
    const normBrand = canonicalBrand(form.brand, brandOptions);
    const normSize = normalizeSize(form.size);
    if (!normBrand) return 'Brand is required.';
    if (!normSize) return 'Size is required.';
    const year = Number(form.year);
    if (form.year === '' || !Number.isInteger(year) || year < 1990 || year > 2100)
      return 'Production year must be an integer between 1990 and 2100.';
    const cost = Number(form.costPrice);
    if (form.costPrice === '' || !Number.isFinite(cost) || cost < 0)
      return 'Purchase cost must be a number greater than or equal to 0.';
    const retail = Number(form.retailPrice);
    if (form.retailPrice === '' || !Number.isFinite(retail) || retail < 0)
      return 'Retail price must be a number greater than or equal to 0.';
    const stock = Number(form.stock);
    if (form.stock === '' || !Number.isInteger(stock) || stock < 0)
      return 'Stock must be a non-negative integer.';
    const dotErr = validateDot(form.dotCode);
    if (dotErr) return dotErr;
    if (form.condition && !['New', 'Used', 'Retreaded'].includes(form.condition))
      return 'Condition must be New, Used, or Retreaded.';
    const skuError = validateSku(form.sku);
    if (skuError) return skuError;
    const barcodeError = validateBarcode(form.barcode);
    if (barcodeError) return barcodeError;
    const supplierErr = validateSupplier(form.supplier);
    if (supplierErr) return supplierErr;
    return '';
  };

  const handleSaveEdit = useCallback(() => {
    if (!selectedTire) return;
    const err = validateEditForm(editForm);
    if (err) {
      setEditError(err);
      setSnackbarMessage(err);
      setSnackbarOpen(true);
      return;
    }
    if (isDuplicateSku(tires, editForm.sku, selectedTire.id)) {
      const dupError = `SKU "${normalizeSku(editForm.sku)}" is already used by another tire. SKUs must be unique.`;
      setEditError(dupError);
      setSnackbarMessage(dupError);
      setSnackbarOpen(true);
      return;
    }

    const normBrand = canonicalBrand(editForm.brand, brandOptions);
    const normSize = normalizeSize(editForm.size);
    const year = Number(editForm.year);
    const cost = Number(editForm.costPrice);
    const retail = Number(editForm.retailPrice);

    const candidate = {
      brand: normBrand,
      size: normSize,
      year,
      season: editForm.season || '',
      condition: editForm.condition || 'New',
      dotCode: editForm.dotCode ? String(editForm.dotCode).trim() : '',
      location: editForm.location ? String(editForm.location).trim() : '',
      supplier: editForm.supplier ? String(editForm.supplier).trim() : '',
      sku: normalizeSku(editForm.sku),
    };

    const duplicateExisting = findDuplicateTire(tires, candidate, selectedTire.id);
    if (duplicateExisting) {
      const dupError = `Duplicate detected: Another identical tire entry exists (${formatTireLabel(duplicateExisting)}).`;
      setEditError(dupError);
      setSnackbarMessage(dupError);
      setSnackbarOpen(true);
      return;
    }

    const updatedFields = {
      brand: normBrand,
      size: normSize,
      year,
      season: editForm.season || '',
      vehicleType: editForm.vehicleType || '',
      price: cost,
      costPrice: cost,
      retailPrice: retail,
      stock: Number(editForm.stock),
      location: editForm.location ? String(editForm.location).trim() : '',
      dotCode: editForm.dotCode ? String(editForm.dotCode).trim() : '',
      loadIndex: editForm.loadIndex ? String(editForm.loadIndex).trim() : '',
      condition: editForm.condition || 'New',
      supplier: editForm.supplier ? String(editForm.supplier).trim() : '',
      sku: normalizeSku(editForm.sku),
      barcode: editForm.barcode ? String(editForm.barcode).trim() : '',
    };
    // Prefer canonical updater so inventory mirror stays in sync.
    if (typeof onUpdateTire === 'function') {
      const ok = onUpdateTire(selectedTire.id, updatedFields);
      if (ok === false) {
        setEditError('Update failed: invalid stock value.');
        return;
      }
    } else if (typeof setTires === 'function') {
      setTires((prevTires) => (prevTires || []).map((tire) =>
        String(tire?.id) === String(selectedTire.id) ? { ...tire, ...updatedFields } : tire
      ));
    } else {
      setSnackbarMessage('Update is unavailable.');
      setSnackbarOpen(true);
      return;
    }
    setSelectedTire((prev) => (prev ? { ...prev, ...updatedFields } : prev));
    setEditMode(false);
    setEditError('');
    setSnackbarMessage('Tire information updated!');
    setSnackbarOpen(true);
    setSuccessData({
      title: 'Tire Updated',
      message: 'Tire information has been updated successfully.',
      details: [
        { label: 'Tire', value: formatTireLabel({ ...selectedTire, ...updatedFields }) },
        { label: 'Brand', value: String(updatedFields.brand || '') },
        { label: 'Size', value: String(updatedFields.size || '') },
        ...(updatedFields.sku ? [{ label: 'SKU', value: updatedFields.sku }] : []),
        { label: 'Stock', value: String(updatedFields.stock ?? '') },
        { label: 'Cost', value: formatMoney(updatedFields.costPrice ?? 0, curOf({ ...selectedTire, ...updatedFields })) },
        { label: 'Retail', value: formatMoney(updatedFields.retailPrice ?? 0, curOf({ ...selectedTire, ...updatedFields })) },
        ...(updatedFields.supplier ? [{ label: 'Supplier', value: updatedFields.supplier }] : [])
      ]
    });
    setSuccessOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editForm, selectedTire, setTires, onUpdateTire, tires, brandOptions]);

   const handleDelete = useCallback(() => {
    if (!selectedTire) {
      setSnackbarMessage('Delete is unavailable.');
      setSnackbarOpen(true);
      return;
    }
    // Cascading delete via parent removes inventory + delivery mirrors (no ghost rows).
    if (typeof onDeleteTire === 'function') {
      onDeleteTire(selectedTire.id);
    } else if (typeof setTires === 'function') {
      const key = String(selectedTire.id);
      setTires((prevTires) => (prevTires || []).filter((tire) => String(tire?.id) !== key));
    } else {
      setSnackbarMessage('Delete is unavailable.');
      setSnackbarOpen(true);
      return;
    }
    setSelectedTire(null);
    setSnackbarMessage('Tire deleted!');
    setSnackbarOpen(true);
  }, [selectedTire, setTires, onDeleteTire]);

  const handleGenerateQRCode = useCallback(() => {
    setShowQRCode(true);
  }, []);

  const handleViewSalesHistory = useCallback(() => {
    setShowSalesHistory(true);
  }, []);

  const handleSale = useCallback(() => {
    if (!selectedTire) {
      setSnackbarMessage('No tire selected.');
      setSnackbarOpen(true);
      return;
    }

    const quantity = Number(saleQuantity);
    const price = Number(salePrice);

    if (!salePrice || !saleDate || !customerName || !Number.isInteger(quantity) || quantity <= 0) {
      setSnackbarMessage('Please fill in all sale information and enter a valid quantity.');
      setSnackbarOpen(true);
      return;
    }

    if (!Number.isFinite(price) || price < 0) {
      setSnackbarMessage('Please enter a valid sale price.');
      setSnackbarOpen(true);
      return;
    }

    const costBasisRaw =
      selectedTire?.costPrice !== undefined &&
      selectedTire?.costPrice !== null &&
      selectedTire?.costPrice !== ''
        ? selectedTire.costPrice
        : selectedTire?.price;
    const costBasis = Number(costBasisRaw);
    if (Number.isFinite(costBasis) && price < costBasis) {
      setSnackbarMessage(
        `Sale price (${formatMoney(price, curOf(selectedTire))}) is below wholesale cost (${formatMoney(costBasis, curOf(selectedTire))}). Adjust the price.`
      );
      setSnackbarOpen(true);
      return;
    }

    if (quantity > Number(selectedTire?.stock || 0)) {
      setSnackbarMessage('Sale quantity cannot exceed stock quantity.');
      setSnackbarOpen(true);
      return;
    }

    const newSale = {
      tireId: selectedTire.id,
      date: saleDate,
      customerName: customerName,
      price: price,
      quantity: quantity,
      size: selectedTire?.size || '',
    };

    const tireLabel = formatTireLabel(selectedTire);
    const customerLabel = customerName;
    const totalLabel = formatMoney(price * quantity, curOf(selectedTire));
    setIsSaving(true);
    setTimeout(() => {
      // Single source of truth: global addSale (updates sales + stock + inventory).
      // No local-only fallback: bypassing addSale would skip sales history,
      // dashboard profit, and the inventory mirror.
      if (typeof addSale !== 'function') {
        setSnackbarMessage('Sales feature is unavailable.');
        setSnackbarOpen(true);
        setIsSaving(false);
        return;
      }
      const ok = addSale(newSale);
      if (ok === false) {
        setSnackbarMessage('Sale failed: check stock.');
        setSnackbarOpen(true);
        setIsSaving(false);
        return;
      }
      // Keep nested per-tire history for the detail dialog, in sync with global sale.
      // NOTE: stock already decremented inside addSale — do not touch it here.
      if (typeof setTires === 'function') {
        setTires((prevTires) => (prevTires || []).map((tire) => {
          if (String(tire?.id) === String(selectedTire.id)) {
            return {
              ...tire,
              salesHistory: [...(tire?.salesHistory || []), newSale],
            };
          }
          return tire;
        }));
      }

      setSnackbarMessage('Sale recorded successfully!');
      setSnackbarOpen(true);
      setSuccessData({
        title: 'Sale Completed',
        message: 'The sale has been completed successfully.',
        details: [
          { label: 'Tire', value: tireLabel },
          { label: 'Customer', value: customerLabel },
          { label: 'Qty', value: String(quantity) },
          { label: 'Total', value: totalLabel }
        ]
      });
      setSuccessOpen(true);
      setIsSaving(false);
      setShowSalesForm(false);
      setSaleDate('');
      setCustomerName('');
      setSaleQuantity(1);
      // Refresh dialog state: decrement local copy so a second sale in the same
      // session validates against fresh stock (global tires[] already updated).
      setSelectedTire((prevTire) => prevTire && ({
        ...prevTire,
        stock: (Number(prevTire?.stock) || 0) - quantity,
        salesHistory: [...(prevTire?.salesHistory || []), newSale],
      }));
    }, 500);
  }, [salePrice, saleDate, customerName, saleQuantity, selectedTire, setTires, addSale]);

  const handleSaleQuantityChange = useCallback((e) => {
    const parsed = parseInt(e.target.value, 10);
    setSaleQuantity(Number.isNaN(parsed) ? '' : parsed);
  }, []);

  // Compact, scannable QR: `TIRE:<id>` resolves via the scan box above and never
  // overflows QR capacity like the old raw-JSON blob did.
  const qrValue = useMemo(() => {
    if (!selectedTire) return '';
    return `TIRE:${selectedTire.id}`;
  }, [selectedTire]);

  const handlePrintLabel = useCallback(() => {
    if (!selectedTire) return;
    const cost = getCost(selectedTire);
    const r = getRetail(selectedTire);
    const retailLabel = Number.isFinite(r) ? formatMoney(r, curOf(selectedTire)) : '—';
    const costLabel = formatMoney(cost, curOf(selectedTire));
    const w = window.open('', '_blank', 'width=400,height=600');
    if (!w) {
      setSnackbarMessage('Popup blocked — allow popups to print labels.');
      setSnackbarOpen(true);
      return;
    }
    w.document.write(`
      <html><head><title>Bin label — ${selectedTire.brand || ''} ${selectedTire.size || ''}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 24px; }
        .label { border: 2px dashed #333; border-radius: 12px; padding: 20px; max-width: 320px; }
        h1 { font-size: 22px; margin: 0 0 8px; } p { margin: 4px 0; font-size: 14px; }
        .code { margin-top: 12px; font-family: monospace; font-size: 13px; word-break: break-all;
                border-top: 1px solid #ccc; padding-top: 8px; }
      </style></head><body>
      <div class="label">
        <h1>${selectedTire.brand || ''} — ${selectedTire.size || ''}</h1>
        <p><strong>Location:</strong> ${selectedTire.location || '-'} &nbsp; <strong>Stock:</strong> ${selectedTire.stock ?? 0}</p>
        <p><strong>DOT:</strong> ${selectedTire.dotCode || '-'} &nbsp; <strong>Load:</strong> ${selectedTire.loadIndex || '-'} &nbsp; <strong>Cond:</strong> ${selectedTire.condition || 'New'}</p>
        <p><strong>Retail:</strong> ${retailLabel} &nbsp; <strong>Cost:</strong> ${costLabel}</p>
        <div class="code">${qrValue}<br/>ID: ${selectedTire.id}</div>
        <p>Scan in Tire List → Scan box to open this record.</p>
      </div>
      <script>window.onload = () => window.print();</script>
      </body></html>`);
    w.document.close();
  }, [selectedTire, qrValue]);


  const paginatedTires = useMemo(() => {
    const start = page * rowsPerPage;
    return (filteredAndSortedTires || []).slice(start, start + rowsPerPage);
  }, [filteredAndSortedTires, page, rowsPerPage]);

  return (
    <StyledPaper elevation={3}>
      <Typography variant="h5" gutterBottom color="primary" fontWeight="bold" style={{ marginBottom: '20px' }}>
        Tire List
      </Typography>
      <Grid container spacing={2} alignItems="center">
        <Grid item xs={12} sm={4}>
          <TextField
            fullWidth
            label="Search by brand, size, rack, SKU, supplier..."
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(0);
            }}
            variant="outlined"
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <TextField
            fullWidth
            label="Scan QR / Enter ID (TIRE:…)"
            value={scanCode}
            onChange={(e) => setScanCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleScan(); }}
            variant="outlined"
            placeholder="TIRE:… or paste ID"
          />
        </Grid>
        <Grid item xs={6} sm={2}>
          <Button fullWidth variant="outlined" startIcon={<QrCodeIcon />} onClick={handleScan}>
            Scan
          </Button>
        </Grid>
        <Grid item xs={6} sm={2}>
          <FormControl fullWidth variant="outlined">
            <InputLabel>Sort</InputLabel>
            <Select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              label="Sort"
            >
              <MenuItem value="brand">Brand</MenuItem>
              <MenuItem value="size">Size</MenuItem>
              <MenuItem value="year">Year</MenuItem>
              <MenuItem value="price">Price</MenuItem>
            </Select>
          </FormControl>
        </Grid>
      </Grid>
      <Box sx={{ mt: 2 }}>
        <List>
          {paginatedTires.length === 0 ? (
            <Typography variant="body2" color="textSecondary" align="center" sx={{ py: 4 }}>
              No tires found matching your criteria.
            </Typography>
          ) : (
            paginatedTires.map((tire, index) => {
              const isLowStock = (Number(tire?.stock) || 0) <= lowStockThreshold;
              const isOutOfStock = (Number(tire?.stock) || 0) === 0;
              return (
                <StyledListItem key={tire?.id ?? index} button onClick={() => handleTireClick(tire)}>
                  <ListItemAvatar>
                    <Avatar src={tire?.images?.[0]} alt={tire?.brand || 'Tire'} />
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography variant="subtitle1" component="span" fontWeight="600">
                          {`${tire?.brand || ''} - ${tire?.size || ''}`}
                        </Typography>
                        {tire?.sku && (
                          <Chip label={`SKU: ${tire.sku}`} size="small" variant="outlined" />
                        )}
                        {tire?.location && (
                          <Chip label={`Rack: ${tire.location}`} size="small" color="primary" variant="outlined" />
                        )}
                        {isOutOfStock ? (
                          <Chip label="Out of stock" size="small" color="error" />
                        ) : isLowStock ? (
                          <Tooltip title={`Stock is ${tire?.stock ?? 0} (low-stock threshold: ≤ ${lowStockThreshold})`}>
                            <Chip label={`Low Stock (${tire?.stock ?? 0})`} size="small" color="warning" icon={<WarningAmberIcon />} />
                          </Tooltip>
                        ) : null}
                      </Box>
                    }
                    secondary={
                      <Typography variant="body2" color="textSecondary">
                        {`${tire?.season || ''} · ${tire?.year ?? ''} · Stock: ${tire?.stock ?? 0} pcs${tire?.condition ? ` · ${tire.condition}` : ''}${tire?.supplier ? ` · Supplier: ${tire.supplier}` : ''}`}
                      </Typography>
                    }
                  />
                </StyledListItem>
              );
            })
          )}
        </List>
        <TablePagination
          rowsPerPageOptions={[5, 10, 25, 50]}
          component="div"
          count={(filteredAndSortedTires || []).length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={(e, newPage) => setPage(newPage)}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
        />
      </Box>
      <Box mt={2} display="flex" justifyContent="space-between">
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={() => { if (typeof onAddNew === 'function') onAddNew(); }}
        >
          Add New Tire
        </Button>
        <Button
          variant="contained"
          color="secondary"
          startIcon={<GetAppIcon />}
          onClick={exportToExcel}
        >
          Export to Excel
        </Button>
      </Box>
        <StyledDialog open={selectedTire !== null} onClose={handleClose} maxWidth="md" fullWidth>
          {selectedTire && (
            <>
              <StyledDialogTitle>
                {selectedTire?.brand || ''} - {selectedTire?.size || ''}
                <IconButton
                  aria-label="close"
                  onClick={handleClose}
                  sx={{
                    position: 'absolute',
                    right: 8,
                    top: 8,
                    color: '#ffffff',
                  }}
                >
                  <CloseIcon />
                </IconButton>
              </StyledDialogTitle>
              <StyledDialogContent>
                <Grid container spacing={3}>
                  <Grid item xs={12} md={6}>
                    <ShareableContent ref={shareableContentRef}>
                      <Typography variant="h6" gutterBottom sx={{ color: 'text.primary', textAlign: 'center' }}>
                        {selectedTire?.brand || ''} - {selectedTire?.size || ''}
                      </Typography>
                      <Carousel>
                        {(selectedTire?.images || []).map((image, index) => (
                          <img
                            key={index}
                            src={image}
                            alt={`${selectedTire?.brand || 'Tire'} ${index + 1}`}
                            style={{ width: '100%', height: '300px', objectFit: 'contain', marginBottom: '16px' }}
                          />
                        ))}
                      </Carousel>
                      {(selectedTire?.images || []).length === 0 && (
                        <Typography variant="body2" sx={{ color: 'text.primary', textAlign: 'center' }}>
                          No images available.
                        </Typography>
                      )}
                      <Typography variant="body1" gutterBottom sx={{ color: 'text.primary' }}>
                        <strong>Size:</strong> {selectedTire?.size || ''}
                      </Typography>
                      <Typography variant="body1" gutterBottom sx={{ color: 'text.primary' }}>
                        <strong>Year:</strong> {selectedTire?.year ?? ''}
                      </Typography>
                      <Typography variant="body1" gutterBottom sx={{ color: 'text.primary' }}>
                        <strong>Season:</strong> {selectedTire?.season || ''}
                      </Typography>
                      <Typography variant="body1" gutterBottom sx={{ color: 'text.primary' }}>
                        <strong>Location:</strong> {selectedTire?.location || '-'}
                      </Typography>
                      <Typography variant="body1" gutterBottom sx={{ color: 'text.primary' }}>
                        <strong>DOT:</strong> {selectedTire?.dotCode || '-'} <strong style={{ marginLeft: 8 }}>Load:</strong> {selectedTire?.loadIndex || '-'} <strong style={{ marginLeft: 8 }}>Condition:</strong> {selectedTire?.condition || 'New'}
                      </Typography>
                      <Typography variant="body1" gutterBottom sx={{ color: 'text.primary' }}>
                        <strong>Stock:</strong> {selectedTire?.stock ?? 0}
                      </Typography>
                      {salePrice && (
                        <Typography variant="body1" gutterBottom sx={{ color: 'text.primary' }}>
                          <strong>Price:</strong> {salePrice} {curOf(selectedTire)}
                        </Typography>
                      )}
                    </ShareableContent>
                  </Grid>
                  <Grid item xs={12} md={6}>
                  <Typography variant="h6" gutterBottom sx={{ color: 'text.primary' }}>Details</Typography>
                    {editMode ? (
                      <>
                        {editError && (
                          <Typography variant="body2" color="error" style={{ marginBottom: 8 }}>
                            {editError}
                          </Typography>
                        )}
                        <TextField fullWidth label="Brand" name="brand" value={editForm.brand} onChange={handleEditFieldChange} margin="normal" required />
                        <TextField fullWidth label="Size" name="size" value={editForm.size} onChange={handleEditFieldChange} margin="normal" required />
                        <TextField fullWidth label="SKU (unique, optional)" name="sku" value={editForm.sku} onChange={handleEditFieldChange} margin="normal" placeholder="e.g. MH-205-01" inputProps={{ maxLength: 32 }} />
                        <TextField fullWidth label="Barcode (optional)" name="barcode" value={editForm.barcode} onChange={handleEditFieldChange} margin="normal" placeholder="e.g. 8697323456789" inputProps={{ maxLength: 48 }} />
                        <TextField fullWidth label="Year" name="year" type="number" value={editForm.year} onChange={handleEditFieldChange} margin="normal" required inputProps={{ min: 1990, max: 2100, step: 1 }} />
                        <TextField fullWidth label="Season" name="season" value={editForm.season} onChange={handleEditFieldChange} margin="normal" />
                        <TextField fullWidth label="Vehicle Type" name="vehicleType" value={editForm.vehicleType} onChange={handleEditFieldChange} margin="normal" />
                        <TextField fullWidth label={`Purchase Cost (${currencySymbol(curOf(selectedTire))})`} name="costPrice" type="number" value={editForm.costPrice} onChange={handleEditFieldChange} margin="normal" required inputProps={{ min: 0, step: 'any' }} />
                        <TextField fullWidth label={`Retail / List Price (${currencySymbol(curOf(selectedTire))})`} name="retailPrice" type="number" value={editForm.retailPrice} onChange={handleEditFieldChange} margin="normal" required inputProps={{ min: 0, step: 'any' }} />
                        <TextField fullWidth label="Stock" name="stock" type="number" value={editForm.stock} onChange={handleEditFieldChange} margin="normal" required inputProps={{ min: 0, step: 1 }} />
                        <TextField fullWidth label="Rack / Location" name="location" value={editForm.location} onChange={handleEditFieldChange} margin="normal" placeholder="B-03 · Level 2" />
                        <TextField fullWidth label="DOT Code" name="dotCode" value={editForm.dotCode} onChange={handleEditFieldChange} margin="normal" placeholder="2422" inputProps={{ maxLength: 4 }} />
                        <TextField fullWidth label="Load & Speed Index" name="loadIndex" value={editForm.loadIndex} onChange={handleEditFieldChange} margin="normal" placeholder="91V" />
                        <TextField fullWidth label="Supplier / Vendor" name="supplier" value={editForm.supplier} onChange={handleEditFieldChange} margin="normal" placeholder="e.g. Continental Wholesale A.S." />
                        <FormControl fullWidth margin="normal">
                          <InputLabel>Condition</InputLabel>
                          <Select name="condition" value={editForm.condition || 'New'} onChange={handleEditFieldChange} label="Condition">
                            <MenuItem value="New">New</MenuItem>
                            <MenuItem value="Used">Used</MenuItem>
                            <MenuItem value="Retreaded">Retreaded</MenuItem>
                          </Select>
                        </FormControl>
                        <Button variant="contained" color="primary" onClick={handleSaveEdit} style={{marginTop: '16px'}}>
                          Save
                        </Button>
                      </>
                    ) : (
                      <>
                         <Typography variant="body1" gutterBottom><strong>Brand:</strong> {selectedTire?.brand || ''}</Typography>
                        <Typography variant="body1" gutterBottom><strong>Size:</strong> {selectedTire?.size || ''}</Typography>
                        <Typography variant="body1" gutterBottom><strong>SKU:</strong> {selectedTire?.sku || '-'}</Typography>
                        <Typography variant="body1" gutterBottom><strong>Barcode:</strong> {selectedTire?.barcode || '-'}</Typography>
                        <Typography variant="body1" gutterBottom><strong>Year:</strong> {selectedTire?.year ?? ''}</Typography>
                        <Typography variant="body1" gutterBottom><strong>Season:</strong> {selectedTire?.season || ''}</Typography>
                        <Typography variant="body1" gutterBottom><strong>Location:</strong> {selectedTire?.location || '-'}</Typography>
                        <Typography variant="body1" gutterBottom><strong>Supplier:</strong> {selectedTire?.supplier || '-'}</Typography>
                        <Typography variant="body1" gutterBottom><strong>DOT / Load / Condition:</strong> {selectedTire?.dotCode || '-'} / {selectedTire?.loadIndex || '-'} / {selectedTire?.condition || 'New'}</Typography>
                        <Typography variant="body1" gutterBottom><strong>Purchase Cost:</strong> {formatMoney(getCost(selectedTire), curOf(selectedTire))}</Typography>
                        <Typography variant="body1" gutterBottom><strong>Retail Price:</strong> {fmtRetail(selectedTire)}</Typography>
                        <Typography variant="body1" gutterBottom><strong>Stock:</strong> {selectedTire?.stock ?? 0}</Typography>
                        <TextField
                          fullWidth
                          label={`Sale Price (${currencySymbol(curOf(selectedTire))})`}
                          value={salePrice}
                          onChange={(e) => setSalePrice(e.target.value)}
                          type="number"
                          style={{ marginTop: '16px', marginBottom: '16px' }}
                          variant="outlined"
                        />
                        <Box display="flex" justifyContent="space-between">
                          <Tooltip title="Share">
                            <Button
                              variant="contained"
                              color="primary"
                              startIcon={<ShareIcon />}
                              onClick={handleShare}
                            >
                              Share
                            </Button>
                          </Tooltip>
                          <Tooltip title="Edit">
                            <Button
                              variant="contained"
                              color="secondary"
                              startIcon={<EditIcon />}
                              onClick={handleEdit}
                            >
                              Edit
                            </Button>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <Button
                              variant="contained"
                              color="error"
                              startIcon={<DeleteIcon />}
                              onClick={handleDelete}
                            >
                              Delete
                            </Button>
                          </Tooltip>
                        </Box>
                        <Box mt={2}>
                          <Button
                            fullWidth
                            variant="contained"
                            color="primary"
                            onClick={() => {
                              if (!salePrice && selectedTire) {
                                const hasRetail =
                                  selectedTire.retailPrice !== undefined &&
                                  selectedTire.retailPrice !== null &&
                                  selectedTire.retailPrice !== '';
                                if (hasRetail) {
                                  const n = Number(selectedTire.retailPrice);
                                  if (Number.isFinite(n)) setSalePrice(String(n));
                                }
                              }
                              setShowSalesForm(true);
                            }}
                          >
                            Make Sale
                          </Button>
                        </Box>
                        <Box mt={2}>
                          <Button
                            fullWidth
                            variant="outlined"
                            startIcon={<QrCodeIcon />}
                            onClick={handleGenerateQRCode}
                          >
                            Generate QR Code
                          </Button>
                        </Box>
                        <Box mt={2}>
                          <Button
                            fullWidth
                            variant="outlined"
                            startIcon={<HistoryIcon />}
                            onClick={handleViewSalesHistory}
                          >
                            View Sales History
                          </Button>
                        </Box>
                      </>
                    )}
                    {showQRCode && (
                      <Box mt={2} display="flex" flexDirection="column" alignItems="center" gap={1}>
                        <QRCode value={qrValue} size={200} />
                        <Typography variant="caption" color="textSecondary" sx={{ wordBreak: 'break-all', textAlign: 'center' }}>
                          {qrValue} — scan in the box above
                        </Typography>
                        <Button variant="outlined" size="small" onClick={handlePrintLabel}>
                          Print Bin Label
                        </Button>
                      </Box>
                    )}
                   {showSalesHistory && (
                      <Box mt={2}>
                        <Typography variant="h6">Sales History</Typography>
                        {(() => {
                          const nested = selectedTire?.salesHistory || [];
                          const global = (sales || []).filter((s) => String(s?.tireId) === String(selectedTire?.id));
                          const merged = [...nested, ...global.filter((g) => !nested.some((n) => String(n?.date) === String(g?.date) && String(n?.customerName) === String(g?.customerName) && Number(n?.quantity) === Number(g?.quantity)))];
                          return merged.length > 0 ? (
                          <TableContainer component={Paper}>
                            <Table>
                              <TableHead>
                                <TableRow>
                                  <TableCell>Date</TableCell>
                                  <TableCell>Customer</TableCell>
                                  <TableCell>Size</TableCell>
                                  <TableCell>Quantity</TableCell>
                                  <TableCell>Price</TableCell>
                                  <TableCell>Actions</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {merged.map((sale, index) => (
                                  <TableRow key={index}>
                                    <TableCell>{sale?.date || ''}</TableCell>
                                    <TableCell>{sale?.customerName || ''}</TableCell>
                                    <TableCell>{sale?.size || selectedTire?.size || ''}</TableCell>
                                    <TableCell>{sale?.quantity ?? ''}</TableCell>
                                    <TableCell>{formatMoney(sale?.price ?? 0, curOf(selectedTire))}</TableCell>
                                    <TableCell>
                                      {sale?.id && typeof onDeleteSale === 'function' && (
                                        <IconButton
                                          aria-label="void sale"
                                          size="small"
                                          color="error"
                                          title="Void sale (restores stock, reverses ledger)"
                                          onClick={() => {
                                            const ok =
                                              typeof window === 'undefined' ||
                                              window.confirm('Void this sale? Stock will be restored and the ledger entry reversed.');
                                            if (ok) onDeleteSale(sale.id);
                                          }}
                                        >
                                          <DeleteIcon fontSize="small" />
                                        </IconButton>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableContainer>
                        ) : (
                          <Typography>No sales history yet.</Typography>
                        );
                        })()}
                      </Box>
                    )}
                 {showSalesForm && (
                      <Box mt={2}>
                        <Typography variant="h6">New Sale</Typography>
                        <TextField
                          fullWidth
                          label="Sale Date"
                          type="date"
                          value={saleDate}
                          onChange={(e) => setSaleDate(e.target.value)}
                          InputLabelProps={{
                            shrink: true,
                          }}
                          margin="normal"
                        />
                        <TextField
                          fullWidth
                          label="Customer Full Name"
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          margin="normal"
                        />
                        <TextField
                          fullWidth
                          label="Sale Quantity"
                          value={saleQuantity}
                          onChange={handleSaleQuantityChange}
                          type="number"
                          InputProps={{ inputProps: { min: 1, max: selectedTire?.stock ?? 1 } }}
                          margin="normal"
                        />
                        <TextField
                          fullWidth
                          label={`Sale Price (${currencySymbol(curOf(selectedTire))})`}
                          value={salePrice}
                          onChange={(e) => setSalePrice(e.target.value)}
                          type="number"
                          margin="normal"
                        />
                        <Button
                          fullWidth
                          variant="contained"
                          color="primary"
                          onClick={handleSale}
                          disabled={isSaving}
                          style={{ marginTop: '16px' }}
                        >
                          {isSaving ? <CircularProgress size={24} color="inherit" /> : 'Save Sale'}
                        </Button>
                      </Box>
                    )}
                  </Grid>
                </Grid>
              </StyledDialogContent>
            </>
          )}
        </StyledDialog>
        <Snackbar
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'center',
          }}
          open={snackbarOpen}
          autoHideDuration={3000}
          onClose={() => setSnackbarOpen(false)}
          message={snackbarMessage}
          action={
            <IconButton
              size="small"
              aria-label="close"
              color="inherit"
              onClick={() => setSnackbarOpen(false)}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          }
        />
        <SuccessModal
          open={successOpen}
          onClose={() => setSuccessOpen(false)}
          title={successData.title || 'Saved successfully'}
          message={successData.message}
          details={successData.details}
          actionLabel="Done"
        />
      </StyledPaper>
  );
}

export default TireList;
