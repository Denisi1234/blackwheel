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
} from "@mui/material";
import SuccessModal from "./SuccessModal";
import {
  getPrefs,
  getNotifs,
  getCompany,
  setPrefs as savePrefs,
  setNotifs as saveNotifs,
  setCompany as saveCompany,
} from "../lib/settings";

function Settings() {
  const [company, setCompany] = useState(() => getCompany());
  const [prefs, setPrefs] = useState(() => getPrefs());
  const [notifs, setNotifs] = useState(() => getNotifs());
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [successModal, setSuccessModal] = useState({ open: false, title: "", message: "", details: [] });

  const handleCompanyChange = (field) => (e) => {
    const next = Object.assign({}, company, { [field]: e.target.value });
    setCompany(next);
    saveCompany({ [field]: e.target.value });
  };

  const handlePrefsChange = (field) => (e) => {
    const raw = e.target.value;
    const next = Object.assign({}, prefs, { [field]: raw });
    setPrefs(next);
    savePrefs({ [field]: raw });
  };

  const handleVatChange = (e) => {
    const v = Number(e.target.value);
    const vatRate = Number.isNaN(v) ? 0 : v;
    setPrefs(Object.assign({}, prefs, { vatRate }));
    savePrefs({ vatRate });
  };

  const handleThresholdChange = (e) => {
    const v = Number(e.target.value);
    const lowStockThreshold = Number.isNaN(v) ? 0 : v;
    setNotifs(Object.assign({}, notifs, { lowStockThreshold }));
    saveNotifs({ lowStockThreshold });
  };

  // Every field already persists to the cloud on change; Save just confirms.
  const handleSaveSettings = () => {
    setIsSaving(true);
    setTimeout(() => {
      saveCompany(company);
      savePrefs(prefs);
      saveNotifs(notifs);
      setIsSaving(false);
      setMessage("Settings saved to the cloud.");
      setSuccessModal({
        open: true,
        title: "Settings Saved",
        message: "Your settings have been saved to the cloud.",
        details: [
          { label: "Company", value: company.name || "-" },
          { label: "Currency", value: prefs.currency || "-" },
          { label: "VAT Rate", value: `${prefs.vatRate ?? 0}%` },
        ],
      });
    }, 400);
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

      <SuccessModal
        open={successModal.open}
        onClose={() => setSuccessModal({ ...successModal, open: false })}
        title={successModal.title}
        message={successModal.message}
        details={successModal.details}
        actionLabel="Done"
      />
    </Box>
  );
}

export default Settings;
