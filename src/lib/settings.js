// Centralized Settings accessors.
// Settings.js UI saves to localStorage keys: settings_company, settings_prefs, settings_notifs.
// All consumers should read via these helpers so VAT / currency / thresholds stay in sync.

export const DEFAULT_PREFS = { vatRate: 20, currency: "TZS" };
export const DEFAULT_NOTIFS = { lowStockThreshold: 4 };
export const DEFAULT_COMPANY = { name: "", phone: "", email: "", address: "", taxId: "" };

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch (e) {
    return fallback;
  }
}

export function getPrefs() {
  return Object.assign({}, DEFAULT_PREFS, loadJSON("settings_prefs", {}));
}

export function getNotifs() {
  return Object.assign({}, DEFAULT_NOTIFS, loadJSON("settings_notifs", {}));
}

export function getCompany() {
  return Object.assign({}, DEFAULT_COMPANY, loadJSON("settings_company", {}));
}

export function getVatRate() {
  const v = Number(getPrefs().vatRate);
  return Number.isFinite(v) && v >= 0 && v <= 100 ? v : 20;
}

export function getCurrency() {
  const c = getPrefs().currency;
  return typeof c === "string" && c ? c : "TZS";
}

export function getLowStockThreshold() {
  const v = Number(getNotifs().lowStockThreshold);
  return Number.isFinite(v) && v >= 0 ? v : 4;
}

export function currencySymbol(code) {
  const c = code || getCurrency();
  if (c === "USD") return "$";
  if (c === "EUR") return "€";
  if (c === "GBP") return "£";
  if (c === "TRY") return "₺";
  return "TSh";
}

export function formatMoney(amount, currency) {
  const cur = currency || getCurrency();
  const n = Number(amount) || 0;
  try {
    if (cur === "TZS") {
      return `${Math.round(n).toLocaleString("en-US")} ${cur}`;
    }
    return `${n.toFixed(2)} ${cur}`;
  } catch (e) {
    return `${n} ${cur}`;
  }
}
