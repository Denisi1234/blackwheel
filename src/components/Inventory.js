import React, { useMemo, useState } from "react";
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  Tooltip,
} from "@mui/material";
import SyncIcon from "@mui/icons-material/Sync";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { getLowStockThreshold } from "../lib/settings";
import { downloadCsv, datedName } from "../lib/documents";

// Single source of truth: tires[].stock is canonical. Rows are driven by
// `tires` so there is exactly one Stock number per tire — staff never has to
// choose between competing columns. The legacy inventory[] mirror is only
// consulted to flag drift (repair via Resync) and to list orphaned rows
// (repair via Purge/Clear); its quantity is never displayed as stock.
function Inventory({ inventory = [], tires = [], onPurgeOrphans, onResync }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const lowStockThreshold = getLowStockThreshold();

  // String-normalized lookups so legacy numeric ids still match uuid rows.
  const inventoryByTireId = useMemo(() => {
    const map = {};
    (inventory || []).forEach((item) => {
      if (item && item.tireId !== undefined && item.tireId !== null) {
        map[String(item.tireId)] = item;
      }
    });
    return map;
  }, [inventory]);

  const tireById = useMemo(() => {
    const map = {};
    (tires || []).forEach((t) => {
      if (t && t.id !== undefined && t.id !== null) {
        map[String(t.id)] = t;
      }
    });
    return map;
  }, [tires]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (tires || [])
      .map((t) => {
        if (!t) return null;
        const mirror = inventoryByTireId[String(t.id)];
        const stock = Number(t.stock);
        const safeStock = Number.isNaN(stock) ? 0 : stock;
        // Only an existing mirror that disagrees counts as drift. Tires
        // without a mirror row (e.g. Supabase tables never backfilled) are
        // normal — Resync will create the mirror silently.
        const mirrorQty = mirror ? Number(mirror.quantity) : NaN;
        const mismatch =
          mirror !== undefined &&
          !Number.isNaN(mirrorQty) &&
          mirrorQty !== safeStock;
        return {
          tireId: t.id,
          brand: t.brand || "Unknown",
          size: t.size || "Unknown",
          sku: t.sku || "-",
          rack: t.location || "-",
          condition: t.condition || "-",
          supplier: t.supplier || "-",
          stock: safeStock,
          mismatch,
        };
      })
      .filter(Boolean)
      .filter((r) => {
        if (!q) return true;
        return (
          String(r.brand).toLowerCase().includes(q) ||
          String(r.size).toLowerCase().includes(q) ||
          String(r.sku).toLowerCase().includes(q) ||
          String(r.rack).toLowerCase().includes(q) ||
          String(r.supplier).toLowerCase().includes(q)
        );
      });
  }, [tires, inventoryByTireId, search]);

  // Mirror rows whose tire no longer exists — shown separately, never as stock.
  const orphanRows = useMemo(
    () => (inventory || []).filter((item) => item && !tireById[String(item?.tireId)]),
    [inventory, tireById]
  );

  const mismatchCount = useMemo(() => rows.filter((r) => r.mismatch).length, [rows]);
  const lowStockCount = useMemo(() => rows.filter((r) => r.stock <= lowStockThreshold).length, [rows, lowStockThreshold]);

  const totalUnits = useMemo(
    () => rows.reduce((sum, r) => sum + (Number(r.stock) || 0), 0),
    [rows]
  );

  const paginatedRows = useMemo(() => {
    const start = page * rowsPerPage;
    return rows.slice(start, start + rowsPerPage);
  }, [rows, page, rowsPerPage]);

  const handleExportCSV = () => {
    downloadCsv(
      datedName("inventory", "csv"),
      ["Brand", "Size", "SKU", "Rack/Location", "Condition", "Supplier", "Stock", "Status"],
      rows.map((r) => [
        r.brand,
        r.size,
        r.sku,
        r.rack,
        r.condition,
        r.supplier,
        r.stock,
        r.stock <= lowStockThreshold ? "Low stock" : "In stock",
      ])
    );
  };

  return (
    <Box>
      <Typography variant="h5" gutterBottom color="primary" fontWeight="bold">
        Inventory
      </Typography>
      <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
        Canonical stock is managed in tires. Exactly one authoritative stock value per tire.
      </Typography>
      <Box sx={{ display: "flex", gap: 1.5, mb: 2.5, flexWrap: "wrap", alignItems: "center" }}>
        <TextField
          label="Search by brand, size, SKU, rack, or supplier"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          variant="outlined"
          size="small"
          sx={{ minWidth: 280, flexGrow: 1 }}
        />
        <Chip
          label={`Total units: ${totalUnits}`}
          color="primary"
        />
        <Chip
          label={`Low-stock (≤ ${lowStockThreshold}): ${lowStockCount}`}
          color={lowStockCount > 0 ? "warning" : "default"}
          variant={lowStockCount > 0 ? "filled" : "outlined"}
          icon={lowStockCount > 0 ? <WarningAmberIcon /> : undefined}
        />
        {mismatchCount > 0 && (
          <Chip label={`${mismatchCount} need resync`} color="warning" />
        )}
        {orphanRows.length > 0 && (
          <Chip label={`${orphanRows.length} orphaned`} color="error" />
        )}
        <Button
          variant="outlined"
          size="small"
          startIcon={<FileDownloadIcon />}
          onClick={handleExportCSV}
        >
          Export CSV
        </Button>
        {typeof onResync === "function" && (
          <Button
            variant="contained"
            color="primary"
            size="small"
            startIcon={<SyncIcon />}
            onClick={onResync}
            title="Reconcile inventory mirror to match tires stock in lockstep"
          >
            Resync
          </Button>
        )}
        {typeof onPurgeOrphans === "function" && (
          <Button
            variant="outlined"
            size="small"
            color="error"
            startIcon={<DeleteSweepIcon />}
            onClick={onPurgeOrphans}
            disabled={orphanRows.length === 0}
            title="Purge ghost records whose parent tire was deleted"
          >
            Purge {orphanRows.length > 0 ? `(${orphanRows.length})` : ""}
          </Button>
        )}
      </Box>

      <TableContainer component={Paper} sx={{ overflowX: "auto" }}>
        <Table stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell><strong>Brand</strong></TableCell>
              <TableCell><strong>Size</strong></TableCell>
              <TableCell><strong>SKU</strong></TableCell>
              <TableCell><strong>Rack / Location</strong></TableCell>
              <TableCell><strong>Condition</strong></TableCell>
              <TableCell><strong>Supplier</strong></TableCell>
              <TableCell align="right"><strong>Stock</strong></TableCell>
              <TableCell align="center"><strong>Status</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 3 }}>
                  No inventory records found.
                </TableCell>
              </TableRow>
            ) : (
              paginatedRows.map((row, idx) => {
                const lowStock = row.stock <= lowStockThreshold;
                const outOfStock = row.stock === 0;
                return (
                  <TableRow
                    key={row.tireId !== undefined && row.tireId !== null ? String(row.tireId) : `row-${idx}`}
                    sx={
                      outOfStock
                        ? { backgroundColor: "rgba(244, 67, 54, 0.08)" }
                        : lowStock
                        ? { backgroundColor: "rgba(255, 152, 0, 0.08)" }
                        : undefined
                    }
                  >
                    <TableCell>{row.brand}</TableCell>
                    <TableCell>{row.size}</TableCell>
                    <TableCell>{row.sku}</TableCell>
                    <TableCell>{row.rack}</TableCell>
                    <TableCell>{row.condition}</TableCell>
                    <TableCell>{row.supplier}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {row.stock}
                    </TableCell>
                    <TableCell align="center">
                      {outOfStock ? (
                        <Chip label="Out of stock" color="error" size="small" />
                      ) : lowStock ? (
                        <Tooltip title={`Stock is ${row.stock} (threshold: ≤ ${lowStockThreshold})`}>
                          <Chip label="Low stock" color="warning" size="small" icon={<WarningAmberIcon />} />
                        </Tooltip>
                      ) : (
                        <Chip label="In stock" color="success" size="small" />
                      )}
                      {row.mismatch && (
                        <Chip
                          label="needs resync"
                          color="warning"
                          variant="outlined"
                          size="small"
                          sx={{ ml: 1 }}
                          title="Background record disagrees with canonical stock — click Resync above."
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        rowsPerPageOptions={[5, 10, 25, 50]}
        component="div"
        count={rows.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={(e, newPage) => setPage(newPage)}
        onRowsPerPageChange={(e) => {
          setRowsPerPage(parseInt(e.target.value, 10));
          setPage(0);
        }}
      />

      {orphanRows.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
            <Typography variant="h6" color="error">
              Orphaned records ({orphanRows.length})
            </Typography>
            {typeof onPurgeOrphans === "function" && (
              <Button
                variant="outlined"
                color="error"
                size="small"
                startIcon={<DeleteSweepIcon />}
                onClick={onPurgeOrphans}
              >
                Purge All Orphans
              </Button>
            )}
          </Box>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
            Background mirror entries whose parent tire no longer exists. They are not counted in stock — purge them to clean up state.
          </Typography>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><strong>Orphan Tire ID</strong></TableCell>
                  <TableCell align="right"><strong>Stored quantity (not stock)</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {orphanRows.map((item, idx) => (
                  <TableRow key={item?.tireId !== undefined && item?.tireId !== null ? String(item.tireId) : `orphan-${idx}`}>
                    <TableCell>Unknown tire ({String(item?.tireId ?? "-")})</TableCell>
                    <TableCell align="right">{Number(item?.quantity) || 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}
    </Box>
  );
}

export default Inventory;
