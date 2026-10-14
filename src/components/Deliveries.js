import React, { useMemo, useState } from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Alert,
  CircularProgress,
  TablePagination,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import Chip from "@mui/material/Chip";
import SuccessModal from "./SuccessModal";
import { newId } from "../lib/store";
import { formatTireLabel } from "../lib/tireIdentity";
import { downloadExcel, datedName, money } from "../lib/documents";
import { getCurrency } from "../lib/settings";

function Deliveries({ deliveries = [], addDelivery, onDeleteDelivery, tires = [] }) {
  const [tireId, setTireId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState("");
  const [localDeliveries, setLocalDeliveries] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [successData, setSuccessData] = useState({ title: "", message: "", details: [] });
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const list = localDeliveries !== null ? localDeliveries : deliveries || [];

  // String-normalized keys so legacy numeric ids still match uuid rows.
  const tireMap = useMemo(() => {
    const map = {};
    (tires || []).forEach((t) => {
      if (t && t.id !== undefined && t.id !== null) {
        map[String(t.id)] = t;
      }
    });
    return map;
  }, [tires]);

  const handleAdd = () => {
    setError("");
    if (tireId === "" || tireId === undefined || tireId === null) {
      setError("Please select a tire.");
      return;
    }
    const qty = Number(quantity);
    if (Number.isNaN(qty) || qty <= 0) {
      setError("Quantity must be greater than 0.");
      return;
    }
    if (!date) {
      setError("Please select a date.");
      return;
    }
    const payload = { tireId, quantity: qty, date };
    setIsSaving(true);
    setTimeout(() => {
      if (typeof addDelivery === "function") {
        addDelivery(payload);
      } else {
        setLocalDeliveries((prev) => [
          ...(prev !== null ? prev : deliveries || []),
          { ...payload, id: newId() },
        ]);
      }
      setTireId("");
      setQuantity(1);
      setIsSaving(false);
      const selectedTire = tireMap[String(tireId)];
      const tireLabel = formatTireLabel(selectedTire);
      setSuccessData({
        title: "Delivery Added",
        message: "The delivery has been added successfully.",
        details: [
          { label: "Tire", value: tireLabel },
          { label: "Quantity", value: String(qty) },
          { label: "Date", value: date },
        ],
      });
      setSuccessOpen(true);
    }, 500);
  };

  const handleDelete = (id) => {
    // Prefer parent handler so inventory is reverted in App.deleteDelivery.
    if (typeof onDeleteDelivery === "function") {
      onDeleteDelivery(id);
      // If we previously diverged into local-only mode, keep it in sync too.
      if (localDeliveries !== null) {
        setLocalDeliveries((prev) => (prev || []).filter((d) => String(d.id) !== String(id)));
      }
      return;
    }
    if (localDeliveries !== null) {
      setLocalDeliveries((prev) => prev.filter((d) => d.id !== id));
    } else if (typeof addDelivery !== "function") {
      setLocalDeliveries((deliveries || []).filter((d) => d.id !== id));
    } else {
      // Local-only delete fallback when parent does not provide delete handler
      setLocalDeliveries((deliveries || []).filter((d) => d.id !== id));
    }
  };

  // Distinguishing label: brand/size plus year, season, SKU and location
  // when present, so duplicate brand/size rows can be told apart.
  const labelForTire = (t) => formatTireLabel(t, { withStock: true });

  const costOf = (t) => {
    const raw = t?.costPrice !== undefined && t?.costPrice !== "" ? t.costPrice : t?.price;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  };

  const curOf = (t) => t?.currency || getCurrency();

  const totalValue = useMemo(
    () =>
      list.reduce((sum, d) => {
        const tire = tireMap[String(d.tireId)];
        return sum + (Number(d.quantity) || 0) * costOf(tire);
      }, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [list, tires]
  );

  const handleExportExcel = () => {
    downloadExcel(
      datedName("deliveries", "xlsx"),
      "Deliveries",
      list.map((d) => {
        const tire = tireMap[String(d.tireId)];
        const qty = Number(d.quantity) || 0;
        const unit = costOf(tire);
        return {
          Date: d.date || "",
          Tire: tire ? formatTireLabel(tire) : "Unknown",
          Quantity: qty,
          "Unit Cost": unit,
          Currency: curOf(tire),
          "Total Value": qty * unit,
        };
      }),
      [12, 42, 10, 12, 10, 14]
    );
  };

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Deliveries
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Box
        sx={{
          display: "flex",
          gap: 2,
          mb: 3,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <FormControl sx={{ minWidth: 220, flexGrow: 1, maxWidth: { xs: "100%", sm: 320 } }} size="small">
          <InputLabel id="delivery-tire-label">Tire</InputLabel>
          <Select
            labelId="delivery-tire-label"
            value={tireId}
            label="Tire"
            onChange={(e) => setTireId(e.target.value)}
          >
            {(tires || []).map((t) => (
              <MenuItem key={t.id} value={t.id}>
                {labelForTire(t)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          label="Quantity"
          type="number"
          size="small"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          inputProps={{ min: 1 }}
          sx={{ width: { xs: "100%", sm: 140 } }}
        />
        <TextField
          label="Date"
          type="date"
          size="small"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ width: { xs: "100%", sm: 160 } }}
        />
        <Button variant="contained" onClick={handleAdd} disabled={isSaving}>
          {isSaving ? <CircularProgress size={24} color="inherit" /> : "Add Delivery"}
        </Button>
        <Button
          variant="outlined"
          size="small"
          startIcon={<FileDownloadIcon />}
          onClick={handleExportExcel}
          disabled={list.length === 0}
        >
          Export Excel
        </Button>
        <Chip
          label={`Total value: ${money(totalValue, getCurrency())}`}
          color="primary"
          variant="outlined"
        />
      </Box>
      <TableContainer component={Paper} sx={{ overflowX: "auto" }}>
        <Table stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>Tire</TableCell>
              <TableCell>Quantity</TableCell>
              <TableCell align="right">Unit Cost</TableCell>
              <TableCell align="right">Total Value</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {list.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  No deliveries yet.
                </TableCell>
              </TableRow>
            ) : (
              list.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((d) => {
                const tire = tireMap[String(d.tireId)];
                const qty = Number(d.quantity) || 0;
                const unit = costOf(tire);
                return (
                  <TableRow key={d.id}>
                    <TableCell>{d.date || "-"}</TableCell>
                    <TableCell>
                      {tire ? labelForTire(tire) : "Unknown"}
                    </TableCell>
                    <TableCell>{qty}</TableCell>
                    <TableCell align="right">{money(unit, curOf(tire))}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {money(qty * unit, curOf(tire))}
                    </TableCell>
                    <TableCell>
                      <IconButton
                        aria-label="delete"
                        onClick={() => handleDelete(d.id)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={list.length}
          page={page}
          rowsPerPage={rowsPerPage}
          onPageChange={(_, p) => setPage(p)}
          onRowsPerPageChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(0); }}
          rowsPerPageOptions={[5, 10, 25, 50]}
        />
      </TableContainer>
      <SuccessModal
        open={successOpen}
        onClose={() => setSuccessOpen(false)}
        title={successData.title || "Delivery Added"}
        message={successData.message}
        details={successData.details}
        actionLabel="Done"
      />
    </Box>
  );
}

export default Deliveries;
