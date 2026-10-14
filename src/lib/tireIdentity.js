// Shared tire identity helpers — one place that decides how a tire is
// labeled anywhere in the UI (sale / delivery dropdowns, success messages,
// exports). Brand + Size alone is ambiguous when the shop stocks duplicates
// (same brand/size, different year/season/batch), so the label folds in the
// distinguishing fields whenever they are present: year, season, SKU and
// rack location.
//
// SKU is the shop-assigned stock-keeping identity (unique when set).
// Barcode is the manufacturer/EAN code scanned off the sidewall (optional).

export function normalizeSku(sku) {
  return String(sku ?? "").trim();
}

// Curated suggestions only — brand and size inputs accept any free text.
export const TIRE_BRANDS = [
  'Michelin', 'Bridgestone', 'Goodyear', 'Continental', 'Pirelli', 'Hankook', 'Yokohama',
  'Dunlop', 'Toyo', 'Kumho', 'Falken', 'BFGoodrich', 'Nexen', 'Firestone', 'Cooper',
  'Petlas', 'Lassa', 'Sailun', 'Linglong', 'Nokian', 'Apollo', 'Maxxis',
];

export const TIRE_SIZES_BY_VEHICLE = {
  'Car': ['155/65R13', '175/65R14', '185/65R15', '195/65R15', '205/55R16', '225/45R17', '235/45R18'],
  'SUV': ['215/65R16', '225/65R17', '235/60R18', '255/55R19', '265/50R20'],
  'Van': ['195R14C', '205/65R16C', '215/65R16C', '225/70R15C'],
  'Truck': ['11R22.5', '295/80R22.5', '315/80R22.5', '385/65R22.5'],
  'Semi Truck': ['385/65R22.5', '315/70R22.5', '295/60R22.5', '315/80R22.5'],
  'Construction': ['23.5R25', '26.5R25', '29.5R25', '35/65R33'],
  'Motorcycle': ['120/70R17', '180/55R17', '160/60R17', '190/50R17'],
  'Tractor': ['18.4-30', '12.4-24', '11.2-24', '13.6-38'],
};

// Optional. 1-32 chars of letters, digits, dash, underscore, dot or slash.
export function validateSku(sku) {
  const v = normalizeSku(sku);
  if (v === "") return "";
  if (v.length > 32) return "SKU must be at most 32 characters.";
  if (!/^[A-Za-z0-9._/-]+$/.test(v))
    return "SKU may only contain letters, digits, dash, underscore, dot or slash.";
  return "";
}

// Optional. Lenient: 1-48 printable characters (covers EAN/UPC/Code128).
export function validateBarcode(barcode) {
  const v = String(barcode ?? "").trim();
  if (v === "") return "";
  if (v.length > 48) return "Barcode must be at most 48 characters.";
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(v)) return "Barcode contains invalid characters.";
  return "";
}

// True when `sku` (non-empty) is already used by another tire.
// `tires` is the full list; `ignoreId` excludes the row being edited.
export function isDuplicateSku(tires, sku, ignoreId) {
  const v = normalizeSku(sku).toLowerCase();
  if (v === "") return false;
  return (tires || []).some(
    (t) =>
      normalizeSku(t?.sku).toLowerCase() === v &&
      String(t?.id) !== String(ignoreId)
  );
}

// ---------- Free-text brand / size normalization + dedupe ----------
// Brand and size are free text (any brand, any size), but variants like
// "michelin " vs "Michelin" or "205/55 r16" vs "205/55R16" must collapse to a
// single value so filters, reports and duplicate detection stay accurate.

const collapseSpaces = (v) => String(v ?? "").replace(/\s+/g, " ").trim();

// "205/55 r 16" -> "205/55R16", "195 r14c" -> "195R14C", "18.4-30" unchanged.
export function normalizeSize(size) {
  return collapseSpaces(size).toUpperCase().replace(/\s+/g, "");
}

// Reuse the casing of an already-known brand (from existing tires or the
// suggestion list) so "michelin" is stored as "Michelin". Unknown brands keep
// the user's casing, trimmed.
export function canonicalBrand(brand, knownBrands) {
  const v = collapseSpaces(brand);
  if (!v) return "";
  const match = (knownBrands || []).find(
    (b) => collapseSpaces(b).toLowerCase() === v.toLowerCase()
  );
  return match ? collapseSpaces(match) : v;
}

// Case-insensitive de-duplicated, sorted option list. First casing seen wins,
// so pass the curated list first to prefer its spelling.
export function uniqueOptions(...lists) {
  const seen = new Map();
  lists.flat().forEach((raw) => {
    const v = collapseSpaces(raw);
    if (!v) return;
    const k = v.toLowerCase();
    if (!seen.has(k)) seen.set(k, v);
  });
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}

// Identity used to spot accidental duplicate records (same physical batch
// entered twice). SKU-less rows are compared on their descriptive fields.
const identityKey = (t) =>
  [
    collapseSpaces(t?.brand).toLowerCase(),
    normalizeSize(t?.size),
    String(t?.year ?? ""),
    collapseSpaces(t?.season).toLowerCase(),
    collapseSpaces(t?.condition || "New").toLowerCase(),
    collapseSpaces(t?.dotCode),
    collapseSpaces(t?.location).toLowerCase(),
    collapseSpaces(t?.supplier).toLowerCase(),
  ].join("|");

// Returns the existing tire that `candidate` duplicates, or null.
export function findDuplicateTire(tires, candidate, ignoreId) {
  if (!candidate) return null;
  // Distinct SKUs mean distinct stock lines even if everything else matches.
  const sku = normalizeSku(candidate.sku).toLowerCase();
  const key = identityKey(candidate);
  return (
    (tires || []).find((t) => {
      if (!t || String(t.id) === String(ignoreId)) return false;
      const tSku = normalizeSku(t.sku).toLowerCase();
      if (sku && tSku && sku !== tSku) return false;
      return identityKey(t) === key;
    }) || null
  );
}

// Optional supplier / vendor name, max 80 chars.
export function validateSupplier(supplier) {
  const v = collapseSpaces(supplier);
  if (v.length > 80) return "Supplier must be at most 80 characters.";
  return "";
}

// Optional DOT week/year code, e.g. 2422 = week 24 of 2022.
export function validateDot(dotCode) {
  const dot = String(dotCode ?? "").trim();
  if (dot === "") return "";
  if (!/^\d{4}$/.test(dot)) return "DOT code must be 4 digits (week + year, e.g. 2422).";
  const week = Number(dot.slice(0, 2));
  if (week < 1 || week > 53) return "DOT code week must be between 01 and 53.";
  return "";
}

// e.g. "Michelin 205/55R16 · 2022 Winter · MH-205-01 · A-1 (10 pcs)"
// Missing parts are omitted so legacy rows still read cleanly, e.g.
// "Lassa 195/65R15 (4 pcs)". Pass { withStock: true } for picker dropdowns.
export function formatTireLabel(tire, options) {
  const withStock = !!(options && options.withStock);
  if (!tire) return "Unknown";
  const head = `${tire.brand || "Unknown"}${tire.size ? ` ${tire.size}` : ""}`.trim();
  const parts = [];
  const yearSeason = `${tire.year ?? ""}${
    tire.year !== undefined && tire.year !== null && tire.year !== "" && tire.season ? " " : ""
  }${tire.season || ""}`.trim();
  if (yearSeason) parts.push(yearSeason);
  const sku = normalizeSku(tire.sku);
  if (sku) parts.push(sku);
  if (tire.location) parts.push(String(tire.location));
  let label = head;
  if (parts.length > 0) label += ` · ${parts.join(" · ")}`;
  if (withStock) {
    const stock = tire.stock ?? 0;
    label += ` (${stock} pcs)`;
  }
  return label;
}
