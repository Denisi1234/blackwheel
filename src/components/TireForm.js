import React, { useState, useMemo } from 'react';
import { TextField, Button, Grid, Paper, Typography, IconButton, Select, MenuItem, FormControl, InputLabel, Box, Divider, CircularProgress } from '@mui/material';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import DeleteIcon from '@mui/icons-material/Delete';
import Autocomplete from '@mui/material/Autocomplete';
import { styled } from '@mui/material/styles';
import SuccessModal from './SuccessModal';
import { uploadTirePhoto } from '../lib/store';
import {
  normalizeSize, canonicalBrand, uniqueOptions, findDuplicateTire, formatTireLabel,
  TIRE_BRANDS, TIRE_SIZES_BY_VEHICLE,
} from '../lib/tireIdentity';

const tireConditions = ['New', 'Used', 'Retreaded'];

const vehicleTypes = ['Car', 'SUV', 'Van', 'Truck', 'Semi Truck', 'Construction', 'Motorcycle', 'Tractor'];

const seasons = ['Summer', 'Winter', 'All Season'];

const MAX_IMAGES = 4;
const MAX_FILE_SIZE = 1024 * 1024; // ~1MB per image pre-compression
const MAX_DIMENSION = 1024; // downscale long edge to bound base64 size
const JPEG_QUALITY = 0.72;
const LOCAL_STORAGE_BUDGET = 4.5 * 1024 * 1024; // stay under the ~5MB domain cap

// Downscale + JPEG-compress so offline base64 fallback stays small.
// A 1MB phone photo typically shrinks to ~80-180KB dataURL after this.
const compressImageFile = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        // JPEG for photos (small); fall back to PNG dataURL on failure.
        const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
        resolve(dataUrl);
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err || new Error(`Failed to load image: ${file.name}`));
    };
    img.src = url;
  });

const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    try {
      reader.readAsDataURL(file);
    } catch (err) {
      reject(err);
    }
  });

const estimateLocalUsage = () => {
  try {
    let total = 0;
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      const v = localStorage.getItem(k) || "";
      total += (k ? k.length : 0) + v.length;
    }
    return total; // ~UTF-16 code units ≈ bytes for ASCII JSON
  } catch (e) {
    return 0;
  }
};

const StyledPaper = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(3),
  marginBottom: theme.spacing(3),
  borderRadius: theme.shape.borderRadius * 2,
  boxShadow: '0 3px 5px 2px rgba(0, 0, 0, .1)',
}));

const StyledButton = styled(Button)(({ theme }) => ({
  marginTop: theme.spacing(2),
  padding: theme.spacing(1.5),
  fontWeight: 'bold',
}));

const emptyTire = {
  brand: '',
  vehicleType: '',
  size: '',
  year: '',
  season: '',
  price: '',
  costPrice: '',
  retailPrice: '',
  currency: 'TZS',
  stock: '',
  condition: 'New',
  images: []
};

const CURRENCIES = ['TZS', 'USD'];

const formatMoney = (amount, currency) => {
  const code = currency === 'USD' ? 'USD' : 'TZS';
  const symbol = code === 'USD' ? '$' : 'TSh';
  const n = Number(amount);
  const body = Number.isFinite(n)
    ? n.toLocaleString('en-US', { maximumFractionDigits: code === 'USD' ? 2 : 0 })
    : String(amount ?? '');
  return `${symbol} ${body} ${code}`;
};

function TireForm({ addTire, tires = [] }) {
  const [tire, setTire] = useState(emptyTire);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [successData, setSuccessData] = useState({ title: '', message: '', details: [] });

  // Deduplicated brand suggestions from both curated list and user inventory
  const brandOptions = useMemo(() => {
    const existingBrands = (tires || []).map((t) => t?.brand).filter(Boolean);
    return uniqueOptions(TIRE_BRANDS, existingBrands);
  }, [tires]);

  // Deduplicated size suggestions based on vehicle type and existing inventory
  const availableSizes = useMemo(() => {
    const baseSizes = tire.vehicleType ? (TIRE_SIZES_BY_VEHICLE[tire.vehicleType] || []) : [];
    const existingSizes = (tires || [])
      .filter((t) => !tire.vehicleType || t?.vehicleType === tire.vehicleType)
      .map((t) => t?.size)
      .filter(Boolean);
    return uniqueOptions(baseSizes, existingSizes);
  }, [tire.vehicleType, tires]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setTire((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => (prev[name] ? { ...prev, [name]: '' } : prev));
  };

  const handleAutocompleteChange = (name, value) => {
    // Guard null (brand clear) -> store "" not null
    setTire((prev) => ({ ...prev, [name]: value ?? '' }));
    setFieldErrors((prev) => (prev[name] ? { ...prev, [name]: '' } : prev));
  };

  const handleImageChange = async (e) => {
    const files = Array.from(e.target.files || []);
    // Reset input so the same file can be selected again
    e.target.value = '';
    if (files.length === 0) return;

    const remainingSlots = MAX_IMAGES - (tire.images?.length || 0);
    if (remainingSlots <= 0) {
      setError(`Maximum ${MAX_IMAGES} images allowed.`);
      return;
    }

    const oversized = files.filter((file) => file.size > MAX_FILE_SIZE);
    if (oversized.length > 0) {
      setError('Each image must be smaller than 1MB.');
    }

    const validFiles = files
      .filter((file) => file.size <= MAX_FILE_SIZE)
      .slice(0, remainingSlots);

    if (validFiles.length === 0) return;

    if (files.length > remainingSlots) {
      setError(`Maximum ${MAX_IMAGES} images allowed. Only the first ${remainingSlots} valid image(s) were added.`);
    }

    // Prefer Supabase Storage URLs when configured; fall back to COMPRESSED
    // dataURL for offline. Compression keeps 4 photos well under localStorage quota.
    const toStored = async (file) => {
      try {
        const url = await uploadTirePhoto(file);
        if (url) return url;
      } catch (err) {
        // fall through to compressed dataURL
      }
      try {
        return await compressImageFile(file);
      } catch (err) {
        return readAsDataUrl(file);
      }
    };

    try {
      const results = await Promise.all(validFiles.map(toStored));
      // Quota guard: refuse images that would push localStorage past budget.
      const usage = estimateLocalUsage();
      const incoming = results.reduce((s, r) => s + String(r || "").length, 0);
      if (usage + incoming > LOCAL_STORAGE_BUDGET) {
        const remoteOnly = results.filter((r) => typeof r === "string" && !r.startsWith("data:"));
        if (remoteOnly.length < results.length) {
          setError(
            'Storage nearly full: only cloud-hosted photos were kept. Connect Supabase Storage or remove existing photos to add more.'
          );
        }
        if (remoteOnly.length === 0 && !uploadTirePhoto) {
          setError('Browser storage is full — cannot add more photos without Supabase Storage.');
          return;
        }
        const keep = remoteOnly.length > 0 ? remoteOnly : [];
        if (keep.length === 0) return;
        setTire((prevTire) => ({
          ...prevTire,
          images: [...(prevTire.images || []), ...keep].slice(0, MAX_IMAGES)
        }));
        return;
      }
      setTire((prevTire) => ({
        ...prevTire,
        images: [...(prevTire.images || []), ...results].slice(0, MAX_IMAGES)
      }));
    } catch (err) {
      setError('Failed to read one or more image files. Please try again.');
    }
  };

  const removeImage = (index) => {
    setTire((prevTire) => ({
      ...prevTire,
      images: (prevTire.images || []).filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    const normBrand = canonicalBrand(tire.brand, brandOptions);
    const normSize = normalizeSize(tire.size);

    if (!normBrand) {
      setFieldErrors({ brand: 'Brand is required.' });
      setError('Brand is required.');
      return;
    }
    if (!normSize) {
      setFieldErrors({ size: 'Size is required.' });
      setError('Size is required.');
      return;
    }

    const year = Number(tire.year);
    if (!Number.isInteger(year) || year < 1990 || year > 2100) {
      setFieldErrors({ year: 'Year must be 1990–2100.' });
      setError('Production year must be an integer between 1990 and 2100.');
      return;
    }

    const rawCost = tire.costPrice !== '' && tire.costPrice !== undefined ? tire.costPrice : tire.price;
    const rawRetail = tire.retailPrice !== '' && tire.retailPrice !== undefined ? tire.retailPrice : rawCost;
    const costPrice = Number(rawCost);
    if (!Number.isFinite(costPrice) || costPrice < 0) {
      setFieldErrors({ costPrice: 'Must be ≥ 0.' });
      setError('Purchase cost must be a number greater than or equal to 0.');
      return;
    }
    const retailPrice = Number(rawRetail);
    if (!Number.isFinite(retailPrice) || retailPrice < 0) {
      setFieldErrors({ retailPrice: 'Must be ≥ 0.' });
      setError('Retail price must be a number greater than or equal to 0.');
      return;
    }

    const stock = Number(tire.stock);
    if (!Number.isInteger(stock) || stock < 0) {
      setFieldErrors({ stock: 'Must be a whole number ≥ 0.' });
      setError('Stock must be a non-negative integer.');
      return;
    }

    if (tire.condition && !tireConditions.includes(tire.condition)) {
      setError('Condition must be New, Used, or Retreaded.');
      return;
    }

    const candidate = {
      brand: normBrand,
      size: normSize,
      year,
      season: tire.season || '',
      condition: tire.condition || 'New',
    };

    const duplicateExisting = findDuplicateTire(tires, candidate);
    if (duplicateExisting) {
      setError(
        `Duplicate detected: An identical tire entry already exists (${formatTireLabel(duplicateExisting)}). Update its stock instead.`
      );
      return;
    }

    // Coerce numbers before addTire
    const currency = tire.currency === 'USD' ? 'USD' : 'TZS';
    const newTire = {
      ...tire,
      brand: normBrand,
      size: normSize,
      vehicleType: tire.vehicleType || '',
      season: tire.season || '',
      year,
      price: costPrice,
      costPrice,
      retailPrice,
      currency,
      stock,
      condition: tire.condition || 'New',
      images: tire.images || []
    };
    setIsSaving(true);
    setTimeout(() => {
      addTire(newTire);
      setTire(emptyTire);
      setIsSaving(false);
      setSuccessData({
        title: 'Tire Added',
        message: 'New tire has been added to inventory.',
        details: [
          { label: 'Brand', value: newTire.brand },
          { label: 'Size', value: newTire.size },
          { label: 'Stock', value: String(newTire.stock) },
          { label: 'Cost', value: formatMoney(newTire.costPrice, currency) },
          { label: 'Retail', value: formatMoney(newTire.retailPrice, currency) },
        ]
      });
      setSuccessOpen(true);
    }, 500);
  };

  const currencySymbol = tire.currency === 'USD' ? '$' : 'TSh';
  const currencyCode = tire.currency === 'USD' ? 'USD' : 'TZS';

  return (
    <StyledPaper elevation={3}>
      <Typography variant="h5" gutterBottom color="primary" fontWeight="bold">
        Add New Tire
      </Typography>
      <Divider sx={{ margin: '16px 0' }} />
      {error && (
        <Typography variant="body2" color="error" sx={{ marginBottom: '12px' }}>
          {error}
        </Typography>
      )}
      <form onSubmit={handleSubmit}>
        <Grid container spacing={3}>
          <Grid item xs={12} sm={6}>
            <Autocomplete
              fullWidth
              freeSolo
              options={brandOptions}
              renderInput={(params) => <TextField {...params} label="Brand" required error={Boolean(fieldErrors.brand)} helperText={fieldErrors.brand || "Type any brand — e.g. Petlas, Lassa, Sailun"} />}
              value={tire.brand || ''}
              inputValue={tire.brand || ''}
              onChange={(event, newValue) => handleAutocompleteChange('brand', newValue)}
              onInputChange={(event, newInput) => handleAutocompleteChange('brand', newInput)}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth required>
              <InputLabel>Vehicle Type</InputLabel>
              <Select
                name="vehicleType"
                value={tire.vehicleType}
                onChange={handleChange}
              >
                {vehicleTypes.map((type) => (
                  <MenuItem key={type} value={type}>{type}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Autocomplete
              fullWidth
              freeSolo
              options={availableSizes}
              renderInput={(params) => <TextField {...params} label="Size" required error={Boolean(fieldErrors.size)} helperText={fieldErrors.size || (tire.vehicleType ? "Pick a suggestion or type a custom size" : "Pick a vehicle type for suggestions, or type any size")} />}
              value={tire.size || ''}
              inputValue={tire.size || ''}
              onChange={(event, newValue) => handleAutocompleteChange('size', newValue)}
              onInputChange={(event, newInput) => handleAutocompleteChange('size', newInput)}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth name="year" label="Production Year" type="number" value={tire.year} onChange={handleChange} required inputProps={{ min: 1990, max: 2100, step: 1 }} error={Boolean(fieldErrors.year)} helperText={fieldErrors.year || ''} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth required>
              <InputLabel>Season</InputLabel>
              <Select
                name="season"
                value={tire.season}
                onChange={handleChange}
              >
                {seasons.map((season) => (
                  <MenuItem key={season} value={season}>{season}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth required>
              <InputLabel>Condition</InputLabel>
              <Select
                name="condition"
                value={tire.condition || 'New'}
                onChange={handleChange}
              >
                {tireConditions.map((c) => (
                  <MenuItem key={c} value={c}>{c}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth name="stock" label="Stock Quantity" type="number" value={tire.stock} onChange={handleChange} required inputProps={{ min: 0, step: 1 }} error={Boolean(fieldErrors.stock)} helperText={fieldErrors.stock || ''} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth required>
              <InputLabel>Currency</InputLabel>
              <Select
                name="currency"
                value={tire.currency || 'TZS'}
                onChange={handleChange}
              >
                {CURRENCIES.map((c) => (
                  <MenuItem key={c} value={c}>{c === 'TZS' ? 'TZS - Tanzanian Shilling' : 'USD - US Dollar'}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth name="costPrice" label={`Purchase Cost (${currencySymbol}) — wholesale`} type="number" value={tire.costPrice} onChange={handleChange} required inputProps={{ min: 0, step: 'any' }} error={Boolean(fieldErrors.costPrice)} helperText={fieldErrors.costPrice || `Used for profit = sale − cost (${currencyCode})`} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth name="retailPrice" label={`Retail / List Price (${currencySymbol}) — default sale price`} type="number" value={tire.retailPrice} onChange={handleChange} required inputProps={{ min: 0, step: 'any' }} error={Boolean(fieldErrors.retailPrice)} helperText={fieldErrors.retailPrice || `Pre-fills the sale form (${currencyCode})`} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <input
              accept="image/*"
              style={{ display: 'none' }}
              id="raised-button-file"
              multiple
              type="file"
              onChange={handleImageChange}
            />
            <label htmlFor="raised-button-file" style={{ height: '100%', display: 'flex' }}>
              <Button
                variant="outlined"
                component="span"
                startIcon={<AddPhotoAlternateIcon />}
                fullWidth
                style={{ height: '100%' }}
              >
                Add Photo
              </Button>
            </label>
            <Typography variant="caption" color="textSecondary" display="block" sx={{ mt: 0.5 }}>
              Photos auto-compress; cloud upload preferred when Supabase is connected.
            </Typography>
          </Grid>
          <Grid item xs={12}>
            <Box mt={1}>
              <Grid container spacing={1}>
                {(tire.images || []).map((image, index) => (
                  <Grid item key={index}>
                    <Box position="relative" width={100} height={100}>
                      <img src={image} alt={`Tire ${index + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }} />
                      <IconButton
                        size="small"
                        style={{ position: 'absolute', top: 0, right: 0, background: 'rgba(255,255,255,0.7)' }}
                        onClick={() => removeImage(index)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </Box>
          </Grid>
          <Grid item xs={12}>
            <StyledButton type="submit" variant="contained" color="primary" size="large" fullWidth disabled={isSaving}>
              {isSaving ? <CircularProgress size={24} color="inherit" /> : 'Add Tire'}
            </StyledButton>
          </Grid>
        </Grid>
      </form>
      <SuccessModal
        open={successOpen}
        onClose={() => setSuccessOpen(false)}
        title={successData.title || 'Tire Added'}
        message={successData.message}
        details={successData.details}
        actionLabel="Done"
      />
    </StyledPaper>
  );
}

export default TireForm;
