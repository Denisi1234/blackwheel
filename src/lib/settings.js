// Centralized Settings accessors — pure cloud, zero browser storage.
// Values live in memory; Settings UI writes them through to the
// `shop_settings` table (one row per shop) fire-and-forget, and
// `loadShopSettings()` pulls them down after login.
import { supabase } from "./supabaseClient";
import { isSupabaseConfigured, getCurrentShopId } from "./store";

export const DEFAULT_PREFS = { vatRate: 20, currency: "TZS" };
export const DEFAULT_NOTIFS = { lowStockThreshold: 4 };
export const DEFAULT_COMPANY = { name: "", phone: "", email: "", address: "", taxId: "" };

const mem = {
  prefs: { ...DEFAULT_PREFS },
  notifs: { ...DEFAULT_NOTIFS },
  company: { ...DEFAULT_COMPANY },
};

function toRow(shopId) {
  return {
    shop_id: shopId,
    currency: mem.prefs.currency || "TZS",
    vat_rate: Number(mem.prefs.vatRate) || 0,
    low_stock_threshold: Number(mem.notifs.lowStockThreshold) || 0,
    company_name: mem.company.name || "",
    company_phone: mem.company.phone || "",
    company_email: mem.company.email || "",
    company_address: mem.company.address || "",
    company_tax_id: mem.company.taxId || "",
    updated_at: new Date().toISOString(),
  };
}

function persist() {
  try {
    if (!isSupabaseConfigured()) return;
    const shopId = getCurrentShopId();
    if (!shopId) return;
    supabase
      .from("shop_settings")
      .upsert(toRow(shopId), { onConflict: "shop_id" })
      .then(({ error }) => {
        if (error) console.warn("Settings persist failed:", error.message);
      });
  } catch (e) {
    // never break the UI for a settings write
  }
}

export async function loadShopSettings() {
  try {
    if (!isSupabaseConfigured()) return;
    const shopId = getCurrentShopId();
    if (!shopId) return;
    const { data, error } = await supabase
      .from("shop_settings")
      .select("*")
      .eq("shop_id", shopId)
      .maybeSingle();
    if (error || !data) return;
    if (typeof data.currency === "string" && data.currency) mem.prefs.currency = data.currency;
    if (data.vat_rate !== null && data.vat_rate !== undefined) mem.prefs.vatRate = Number(data.vat_rate);
    if (data.low_stock_threshold !== null && data.low_stock_threshold !== undefined) {
      mem.notifs.lowStockThreshold = Number(data.low_stock_threshold);
    }
    if (data.company_name !== undefined) mem.company.name = data.company_name || "";
    if (data.company_phone !== undefined) mem.company.phone = data.company_phone || "";
    if (data.company_email !== undefined) mem.company.email = data.company_email || "";
    if (data.company_address !== undefined) mem.company.address = data.company_address || "";
    if (data.company_tax_id !== undefined) mem.company.taxId = data.company_tax_id || "";
  } catch (e) {
    // keep memory defaults on any failure
  }
}

export function resetSettingsMemory() {
  mem.prefs = { ...DEFAULT_PREFS };
  mem.notifs = { ...DEFAULT_NOTIFS };
  mem.company = { ...DEFAULT_COMPANY };
}

export function getPrefs() {
  return Object.assign({}, DEFAULT_PREFS, mem.prefs);
}

export function getNotifs() {
  return Object.assign({}, DEFAULT_NOTIFS, mem.notifs);
}

export function getCompany() {
  return Object.assign({}, DEFAULT_COMPANY, mem.company);
}

export function setPrefs(patch) {
  Object.assign(mem.prefs, patch || {});
  persist();
  return getPrefs();
}

export function setNotifs(patch) {
  Object.assign(mem.notifs, patch || {});
  persist();
  return getNotifs();
}

export function setCompany(patch) {
  Object.assign(mem.company, patch || {});
  persist();
  return getCompany();
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
