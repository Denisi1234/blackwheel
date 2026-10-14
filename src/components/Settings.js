import React, { useState } from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Divider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  Grid,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import SuccessModal from "./SuccessModal";
import { syncLocalToCloud, isSupabaseConfigured } from "../lib/store";

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch (e) {
    console.error(`Failed to load "${key}":`, e);
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error(`Failed to save "${key}":`, e);
    return false;
  }
}

const DEFAULT_COMPANY = {
  name: "",
  phone: "",
  email: "",
  address: "",
  taxId: "",
};

const DEFAULT_PREFS = {
  vatRate: 20,
  currency: "TZS",
};

const DEFAULT_NOTIFS = {
  lowStockThreshold: 4,
};

function Settings() {
  const [company, setCompany] = useState(() =>
    Object.assign({}, DEFAULT_COMPANY, loadJSON("settings_company", {}))
  );
  const [prefs, setPrefs] = useState(() =>
    Object.assign({}, DEFAULT_PREFS, loadJSON("settings_prefs", {}))
  );
  const [notifs, setNotifs] = useState(() =>
    Object.assign({}, DEFAULT_NOTIFS, loadJSON("settings_notifs", {}))
  );
  const [message, setMessage] = useState("");
  const [importText, setImportText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [successModal, setSuccessModal] = useState({ open: false, title: "", message: "", details: [] });
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Push browser-only rows up to Supabase under the current shop.
  // Needed when records were created before a shop was selected (or while
  // cloud writes failed) — otherwise other devices never see them.
  const handleSyncToCloud = async () => {
    if (syncing) return;
    setSyncing(true);
    setMessage("");
    try {
      const res = await syncLocalToCloud();
      if (!res || !res.ok) {
        setMessage(`Cloud sync failed: ${res && res.error ? res.error : "unknown error."}`);
        return;
      }
      const up = res.totalUploaded || 0;
      const fail = res.totalFailed || 0;
      const skip = res.totalSkipped || 0;
      setMessage(
        `Cloud sync done: ${up} uploaded, ${skip} already in cloud, ${fail} failed. Refresh to reload from the cloud.`
      );
      setSuccessModal({
        open: true,
        title: "Cloud Sync Complete",
        message: `Uploaded ${up} local record(s) to your shop in the cloud.`,
        details: [
          { label: "Uploaded", value: String(up) },
          { label: "Already in cloud", value: String(skip) },
          { label: "Failed", value: String(fail) },
        ],
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleCompanyChange = (field) => (e) => {
    const next = Object.assign({}, company, { [field]: e.target.value });
    setCompany(next);
    saveJSON("settings_company", next);
  };

  const handlePrefsChange = (field) => (e) => {
    const raw = e.target.value;
    const next = Object.assign({}, prefs, { [field]: raw });
    setPrefs(next);
    saveJSON("settings_prefs", next);
  };

  const handleVatChange = (e) => {
    const v = Number(e.target.value);
    const next = Object.assign({}, prefs, {
      vatRate: Number.isNaN(v) ? 0 : v,
    });
    setPrefs(next);
    saveJSON("settings_prefs", next);
  };

  const handleThresholdChange = (e) => {
    const v = Number(e.target.value);
    const next = Object.assign({}, notifs, {
      lowStockThreshold: Number.isNaN(v) ? 0 : v,
    });
    setNotifs(next);
    saveJSON("settings_notifs", next);
  };

  const handleSaveSettings = () => {
    setIsSaving(true);
    setTimeout(() => {
      const okCompany = saveJSON("settings_company", company);
      const okPrefs = saveJSON("settings_prefs", prefs);
      const okNotifs = saveJSON("settings_notifs", notifs);
      const ok = okCompany && okPrefs && okNotifs;
      setIsSaving(false);
      setMessage(ok ? "Settings saved successfully." : "Settings save failed. See console for details.");
      setSuccessModal({
        open: true,
        title: "Settings Saved",
        message: ok
          ? "Your settings have been saved successfully."
          : "Settings save failed. See console for details.",
        details: [
          { label: "Company", value: company.name || "-" },
          { label: "Currency", value: prefs.currency || "-" },
          { label: "VAT Rate", value: `${prefs.vatRate ?? 0}%` },
        ],
      });
    }, 600);
  };

  const handleExport = () => {
    try {
      const data = {};
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        try {
          data[key] = JSON.parse(localStorage.getItem(key));
        } catch (err) {
          data[key] = localStorage.getItem(key);
        }
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "tire-management-backup.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMessage("Backup exported successfully.");
      setSuccessModal({
        open: true,
        title: "Export Complete",
        message: "Backup exported successfully.",
        details: [
          { label: "Keys", value: String(Object.keys(data).length) },
          { label: "File", value: "tire-management-backup.json" },
        ],
      });
    } catch (e) {
      console.error("Export failed:", e);
      setMessage("Export failed. See console for details.");
    }
  };

  const handleImport = () => {
    if (!importText.trim()) {
      setMessage("Please paste JSON to import.");
      return;
    }
    try {
      const parsed = JSON.parse(importText);
      if (typeof parsed !== "object" || parsed === null) {
        setMessage("Invalid import data.");
        return;
      }
      Object.keys(parsed).forEach((key) => {
        try {
          localStorage.setItem(key, JSON.stringify(parsed[key]));
        } catch (e) {
          console.error(`Failed to import key "${key}":`, e);
        }
      });
      setCompany(
        Object.assign({}, DEFAULT_COMPANY, loadJSON("settings_company", {}))
      );
      setPrefs(Object.assign({}, DEFAULT_PREFS, loadJSON("settings_prefs", {})));
      setNotifs(
        Object.assign({}, DEFAULT_NOTIFS, loadJSON("settings_notifs", {}))
      );
      setMessage("Import completed successfully.");
      setImportText("");
      setSuccessModal({
        open: true,
        title: "Import Complete",
        message: "Import completed successfully.",
        details: [{ label: "Records", value: String(Object.keys(parsed).length) }],
      });
    } catch (e) {
      console.error("Import failed:", e);
      setMessage("Import failed: invalid JSON.");
    }
  };

  const handleClearAll = () => {
    setConfirmClearOpen(true);
  };

  const doClearAll = () => {
    try {
      localStorage.clear();
      setCompany(Object.assign({}, DEFAULT_COMPANY));
      setPrefs(Object.assign({}, DEFAULT_PREFS));
      setNotifs(Object.assign({}, DEFAULT_NOTIFS));
      setImportText("");
      setMessage("All local data cleared.");
    } catch (e) {
      console.error("Clear failed:", e);
      setMessage("Failed to clear data.");
    }
    setConfirmClearOpen(false);
  };

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Settings
      </Typography>
      {message && (
        <Alert severity="info" sx={{ mb: 2 }} onClose={() => setMessage("")}>
          {message}
        </Alert>
      )}
      <Box sx={{ display: "flex", gap: 2, mb: 3 }}>
        <Button
          variant="contained"
          onClick={handleSaveSettings}
          disabled={isSaving}
          startIcon={isSaving ? <CircularProgress size={20} color="inherit" /> : null}
        >
          {isSaving ? "Saving..." : "Save Settings"}
        </Button>
      </Box>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Company Profile
        </Typography>
        <Divider sx={{ mb: 2 }} />
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Company name"
              value={company.name || ""}
              onChange={handleCompanyChange("name")}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Phone"
              value={company.phone || ""}
              onChange={handleCompanyChange("phone")}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Email"
              type="email"
              value={company.email || ""}
              onChange={handleCompanyChange("email")}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Tax ID"
              value={company.taxId || ""}
              onChange={handleCompanyChange("taxId")}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Address"
              multiline
              rows={2}
              value={company.address || ""}
              onChange={handleCompanyChange("address")}
            />
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Tax &amp; Currency
        </Typography>
        <Divider sx={{ mb: 2 }} />
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="VAT rate (%)"
              type="number"
              value={prefs.vatRate ?? 0}
              onChange={handleVatChange}
              inputProps={{ min: 0, max: 100 }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel id="currency-label">Currency</InputLabel>
              <Select
                labelId="currency-label"
                value={prefs.currency || "TZS"}
                label="Currency"
                onChange={handlePrefsChange("currency")}
              >
                <MenuItem value="TZS">TZS - Tanzanian Shilling</MenuItem>
                <MenuItem value="USD">USD - US Dollar</MenuItem>
                <MenuItem value="EUR">EUR - Euro</MenuItem>
                <MenuItem value="TRY">TRY - Turkish Lira</MenuItem>
                <MenuItem value="GBP">GBP - British Pound</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Notifications
        </Typography>
        <Divider sx={{ mb: 2 }} />
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Low-stock threshold"
              type="number"
              value={notifs.lowStockThreshold ?? 4}
              onChange={handleThresholdChange}
              inputProps={{ min: 0 }}
            />
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Data Management
        </Typography>
        <Divider sx={{ mb: 2 }} />
        <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap" }}>
          <Button variant="contained" onClick={handleExport}>
            Export All Data
          </Button>
          {isSupabaseConfigured() && (
            <Button variant="contained" color="success" onClick={handleSyncToCloud} disabled={syncing}>
              {syncing ? "Syncing…" : "Sync Local Data to Cloud"}
            </Button>
          )}
          <Button variant="outlined" color="error" onClick={handleClearAll}>
            Clear All Data
          </Button>
        </Box>
        <TextField
          fullWidth
          label="Paste backup JSON to import"
          multiline
          rows={4}
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          sx={{ mb: 2 }}
        />
        <Button variant="contained" color="secondary" onClick={handleImport}>
          Import JSON
        </Button>
      </Paper>
      <SuccessModal
        open={successModal.open}
        onClose={() => setSuccessModal({ ...successModal, open: false })}
        title={successModal.title}
        message={successModal.message}
        details={successModal.details}
        actionLabel="Done"
      />
      <Dialog open={confirmClearOpen} onClose={() => setConfirmClearOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Clear all local data?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">This cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmClearOpen(false)}>Cancel</Button>
          <Button onClick={doClearAll} color="error" variant="contained">Clear</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Settings;
