// Pure-cloud Supabase store. No browser storage anywhere: every read comes
// from Postgres, every write goes to Postgres. The UI stays instant because
// writes update in-memory state first and sync to the cloud fire-and-forget.
import { supabase } from "./supabaseClient";

export function isSupabaseConfigured() {
  const url = process.env.REACT_APP_SUPABASE_URL || "";
  const key = process.env.REACT_APP_SUPABASE_ANON_KEY || "";
  if (!url || !key) return false;
  if (url.includes("placeholder") || key.includes("placeholder")) return false;
  if (url.includes("xyzcompany")) return false;
  return true;
}

// Client-side UUID generation so local rows already satisfy Postgres `uuid` PKs.
// Falls back to a timestamp+random string when crypto.randomUUID is unavailable.
export function newId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch (e) {
    // fall through
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// UUID validation — numeric legacy ids (Date.now()) are NOT valid uuids and
// must still be stripped on insert so Postgres can generate one.
export function isUuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

// Module keys -> supabase tables. Tables not listed here are UI-only.
const TABLE_MAP = {
  tires: "tires",
  sales: "sales",
  inventory: "inventory",
  deliveries: "deliveries",
  accounts: "accounts",
  transactions: "transactions",
  invoices: "invoices",
  hotelCustomers: "hotel_customers",
  hotelTires: "hotel_tires",
  vehicles: "vehicles",
  services: "services",
  workers: "workers",
  tasks: "tasks",
  appointments: "appointments",
  profiles: "profiles",
  shops: "shops",
  auditLog: "audit_log",
  taskComments: "task_comments",
  notifications: "notifications",
};

// Tables that belong to exactly one shop. `shops` itself and `profiles`
// (needed cross-shop for invites/switching; RLS still enforces visibility)
// are never auto-scoped.
const TENANT_TABLES = new Set([
  "tires",
  "sales",
  "inventory",
  "deliveries",
  "accounts",
  "transactions",
  "invoices",
  "hotel_customers",
  "hotel_tires",
  "vehicles",
  "services",
  "workers",
  "tasks",
  "appointments",
  "audit_log",
  "task_comments",
  "notifications",
]);

// Active shop id lives in memory only (never in browser storage): a refresh
// re-resolves it from the user's memberships, so accounts can never leak
// across logins on shared devices.
let MEM_SHOP_ID = "";

export function getCurrentShopId() {
  return MEM_SHOP_ID || "";
}

export function setCurrentShopId(id) {
  MEM_SHOP_ID = id || "";
}

// ---------- Audit log ----------
// Who changed what: every successful cloud mutation below records actor,
// action, table and row. Fire-and-forget, never blocks the UI, and never
// audits itself (no recursion). The actor is set by App on login.
let AUDIT_ACTOR = null;

export function setAuditActor(actor) {
  AUDIT_ACTOR =
    actor && actor.id
      ? {
          id: String(actor.id),
          email: String(actor.email || ""),
          name: String(actor.name || ""),
        }
      : null;
}

// Short human summary per table for the audit trail. Pure (unit-tested).
export function auditSummary(table, row) {
  const r = row || {};
  const s = (v) => String(v ?? "").trim();
  if (table === "tires") {
    return [r.brand, r.size, r.year].filter(Boolean).join(" ").slice(0, 80) || `tire ${s(r.id).slice(0, 8)}`;
  }
  if (table === "sales") {
    return `${s(r.customerName || r.customer_name) || "sale"} ×${r.quantity ?? ""}`.slice(0, 80);
  }
  if (table === "hotel_tires") {
    return [r.customerName || r.customer_name, r.plateNumber || r.plate_number].filter(Boolean).join(" — ").slice(0, 80);
  }
  if (table === "vehicles") {
    return s(r.licensePlate || r.license_plate) || `vehicle ${s(r.id).slice(0, 8)}`;
  }
  if (table === "workers" || table === "profiles") {
    return s(r.name || r.full_name || r.email) || `member ${s(r.id).slice(0, 8)}`;
  }
  if (table === "tasks" || table === "appointments" || table === "services") {
    return s(r.task || r.service || r.work_done || r.workDone) || `${table} ${s(r.id).slice(0, 8)}`;
  }
  if (table === "task_comments") {
    return s(r.message).slice(0, 80) || `reply ${s(r.id).slice(0, 8)}`;
  }
  if (table === "notifications") {
    return s(r.title || r.body).slice(0, 80) || `${s(r.type) || "notice"} ${s(r.id).slice(0, 8)}`;
  }
  if (table === "accounts") {
    return s(r.name) || `account ${s(r.id).slice(0, 8)}`;
  }
  if (table === "transactions" || table === "invoices") {
    return s(r.description || r.number) || `${table} ${s(r.id).slice(0, 8)}`;
  }
  if (table === "hotel_customers") {
    return s(r.name || r.email || r.phone) || `customer ${s(r.id).slice(0, 8)}`;
  }
  if (table === "shop_settings") {
    return s(r.key || "settings") || `settings ${s(r.id).slice(0, 8)}`;
  }
  if (table === "deliveries" || table === "inventory") {
    return `${table} ×${r.quantity ?? ""}`.slice(0, 80);
  }
  return `${table} ${s(r.id).slice(0, 8)}`.slice(0, 80);
}

function auditWrite(table, op, row) {
  try {
    if (!isSupabaseConfigured()) return;
    if (table === "audit_log") return;
    if (!AUDIT_ACTOR) return;
    const shopId = getCurrentShopId();
    if (!shopId) return;
    const rowId = row && row.id !== undefined && row.id !== null ? String(row.id) : "";
    supabase
      .from("audit_log")
      .insert({
        shop_id: shopId,
        actor_id: AUDIT_ACTOR.id,
        actor_email: AUDIT_ACTOR.email,
        actor_name: AUDIT_ACTOR.name,
        action: op,
        table_name: table,
        row_id: rowId,
        summary: auditSummary(table, row),
      })
      .then(({ error }) => {
        if (error) console.warn("Audit write failed:", error.message);
      });
  } catch (e) {
    // audit must never break the save path
  }
}

// App invoice statuses <-> Postgres check constraint values.
const INVOICE_STATUS_TO_DB = { Paid: "Ödendi", Unpaid: "Ödenmedi", Cancelled: "İptal" };
const INVOICE_STATUS_FROM_DB = { "Ödendi": "Paid", "Ödenmedi": "Unpaid", "İptal": "Cancelled" };

// App-facing EN statuses <-> Postgres TR check values.
const APPT_STATUS_TO_DB = {
  New: "Yeni",
  Updated: "Güncellendi",
  Completed: "Tamamlandı",
  Cancelled: "İptal",
};
const APPT_STATUS_FROM_DB = {
  "Yeni": "New",
  "Güncellendi": "Updated",
  "Tamamlandı": "Completed",
  "İptal": "Cancelled",
};
const TASK_STATUS_TO_DB = {
  "In Progress": "Devam Ediyor",
  Completed: "Tamamlandı",
  Cancelled: "İptal",
};
const TASK_STATUS_FROM_DB = {
  "Devam Ediyor": "In Progress",
  "Tamamlandı": "Completed",
  "İptal": "Cancelled",
};

// UI keeps full ISO date-times; Postgres wants plain date / time parts.
function isoDatePart(v) {
  if (!v) return "";
  try {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    const m = String(v).match(/(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : "";
  } catch (e) {
    return "";
  }
}

function isoTimePart(v) {
  if (!v) return "";
  try {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) {
      const p = (n) => String(n).padStart(2, "0");
      return `${p(d.getHours())}:${p(d.getMinutes())}`;
    }
    const m = String(v).match(/(\d{1,2}):(\d{2})/);
    return m ? `${String(m[1]).padStart(2, "0")}:${m[2]}` : "";
  } catch (e) {
    return "";
  }
}

function mapRowForSupabase(table, row) {
  if (!row || typeof row !== "object") return row;
  const out = { ...row };
  // App uses camelCase; supabase uses snake_case.
  if (table === "sales") {
    if (out.tireId !== undefined && out.tire_id === undefined) out.tire_id = out.tireId;
    delete out.tireId;
    if (out.customerName !== undefined && out.customer_name === undefined)
      out.customer_name = out.customerName;
    delete out.customerName;
    // UI-only denormalized field — no `size` column on sales.
    delete out.size;
  }
  if (table === "inventory") {
    if (out.tireId !== undefined && out.tire_id === undefined) out.tire_id = out.tireId;
    delete out.tireId;
  }
  if (table === "deliveries") {
    if (out.tireId !== undefined && out.tire_id === undefined) out.tire_id = out.tireId;
    delete out.tireId;
    // Deliveries table has no `date` column — persist UI date into created_at.
    if (out.date !== undefined) {
      if (out.created_at === undefined && out.date) {
        try {
          const d = new Date(out.date);
          out.created_at = Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
        } catch (e) {
          out.created_at = new Date().toISOString();
        }
      }
      delete out.date;
    }
    delete out.size;
  }
  if (table === "accounts") {
    if (out.taxId !== undefined && out.tax_id === undefined) out.tax_id = out.taxId;
    delete out.taxId;
    // Legacy nested UI model — transactions live in their own table now.
    delete out.transactions;
  }
  if (table === "transactions") {
    if (out.accountId !== undefined && out.account_id === undefined) out.account_id = out.accountId;
    delete out.accountId;
    if (out.date === "") delete out.date;
  }
  if (table === "invoices") {
    if (out.customerId !== undefined && out.customer_id === undefined) out.customer_id = out.customerId;
    delete out.customerId;
    if (out.dueDate !== undefined && out.due_date === undefined) out.due_date = out.dueDate;
    delete out.dueDate;
    if (out.due_date === "") delete out.due_date;
    if (out.number === "") delete out.number;
    if (out.status !== undefined) {
      out.status = INVOICE_STATUS_TO_DB[out.status] || "Ödenmedi";
    }
  }
  if (table === "hotel_tires") {
    if (out.customerName !== undefined && out.customer_name === undefined)
      out.customer_name = out.customerName;
    delete out.customerName;
    if (out.customerId !== undefined && out.customer_id === undefined)
      out.customer_id = out.customerId;
    delete out.customerId;
    if (out.storageDate !== undefined && out.storage_date === undefined)
      out.storage_date = isoDatePart(out.storageDate) || null;
    delete out.storageDate;
    if (out.retrievalDate !== undefined && out.retrieval_date === undefined)
      out.retrieval_date = isoDatePart(out.retrievalDate) || null;
    delete out.retrievalDate;
    if (out.plateNumber !== undefined && out.plate_number === undefined)
      out.plate_number = out.plateNumber;
    delete out.plateNumber;
    if (out.vehicleModel !== undefined && out.vehicle_model === undefined)
      out.vehicle_model = out.vehicleModel;
    delete out.vehicleModel;
    if (out.photo !== undefined && out.photo_url === undefined) out.photo_url = out.photo;
    delete out.photo;
    if (out.retrieved === undefined) out.retrieved = false;
    if (out.quantity !== undefined) {
      const q = Number(out.quantity);
      out.quantity = Number.isFinite(q) && q > 0 ? Math.round(q) : 4;
    }
  }
  if (table === "vehicles") {
    if (out.licensePlate !== undefined && out.license_plate === undefined)
      out.license_plate = out.licensePlate;
    delete out.licensePlate;
    // Nested UI-only services live in the services table.
    delete out.services;
  }
  if (table === "services") {
    if (out.vehicleId !== undefined && out.vehicle_id === undefined)
      out.vehicle_id = out.vehicleId;
    delete out.vehicleId;
    if (out.customerName !== undefined && out.customer_name === undefined)
      out.customer_name = out.customerName;
    delete out.customerName;
    if (out.mechanicName !== undefined && out.mechanic_name === undefined)
      out.mechanic_name = out.mechanicName;
    delete out.mechanicName;
    if (out.workDone !== undefined && out.work_done === undefined)
      out.work_done = out.workDone;
    delete out.workDone;
    if (out.nextServiceDate !== undefined && out.next_service_date === undefined)
      out.next_service_date = isoDatePart(out.nextServiceDate) || null;
    delete out.nextServiceDate;
    if (out.date !== undefined) {
      const part = isoDatePart(out.date);
      out.date = part || null;
    }
    if (out.cost !== undefined) {
      const c = Number(out.cost);
      out.cost = Number.isFinite(c) && c >= 0 ? c : 0;
    }
    // UI-only helpers that have no DB column.
    delete out.licensePlate;
    delete out.index;
    delete out.originalIndex;
  }
  if (table === "tasks") {
    if (out.workerId !== undefined && out.worker_id === undefined)
      out.worker_id = out.workerId;
    delete out.workerId;
    if (out.date !== undefined) {
      const part = isoDatePart(out.date);
      out.date = part || null;
    }
    if (out.time !== undefined) {
      const part = isoTimePart(out.time);
      if (part) out.time = part;
      else delete out.time;
    }
    if (out.completionTime !== undefined && out.completion_time === undefined)
      out.completion_time = out.completionTime || null;
    delete out.completionTime;
    if (out.status !== undefined) {
      out.status = TASK_STATUS_TO_DB[out.status] || "Devam Ediyor";
    }
  }
  if (table === "task_comments" || table === "notifications") {
    if (out.taskId !== undefined && out.task_id === undefined) out.task_id = out.taskId;
    delete out.taskId;
    if (out.task_id === "") delete out.task_id;
  }
  if (table === "appointments") {
    if (out.customerName !== undefined && out.customer_name === undefined)
      out.customer_name = out.customerName;
    delete out.customerName;
    if (out.phoneNumber !== undefined && out.phone_number === undefined)
      out.phone_number = out.phoneNumber;
    delete out.phoneNumber;
    if (out.sendReminder !== undefined && out.send_reminder === undefined)
      out.send_reminder = Boolean(out.sendReminder);
    delete out.sendReminder;
    if (out.date !== undefined) {
      const part = isoDatePart(out.date);
      out.date = part || null;
    }
    if (out.time !== undefined) {
      const part = isoTimePart(out.time);
      if (part) out.time = part;
      else delete out.time;
    }
    if (out.status !== undefined) {
      out.status = APPT_STATUS_TO_DB[out.status] || "Yeni";
    }
  }
  if (table === "profiles") {
    if (out.name !== undefined && out.full_name === undefined) out.full_name = out.name;
    delete out.name;
    if (out.shopId !== undefined && out.shop_id === undefined) out.shop_id = out.shopId;
    delete out.shopId;
  }
  // shops columns already match app shape (name, created_by).
  if (table === "tires") {
    if (out.vehicleType !== undefined && out.vehicle_type === undefined) out.vehicle_type = out.vehicleType;
    delete out.vehicleType;
    if (out.images !== undefined && out.image_urls === undefined) out.image_urls = out.images;
    delete out.images;
    // Cost vs retail split: legacy `price` carried cost. New rows carry both.
    if (out.costPrice !== undefined && out.cost_price === undefined) out.cost_price = out.costPrice;
    delete out.costPrice;
    if (out.retailPrice !== undefined && out.retail_price === undefined) out.retail_price = out.retailPrice;
    delete out.retailPrice;
    // Warehouse / safety / spec fields (added to schema; harmless if column missing
    // on older DBs — Supabase will error, caught below and logged).
    if (out.location !== undefined && out.rack_location === undefined) out.rack_location = out.location;
    delete out.location;
    if (out.dotCode !== undefined && out.dot_code === undefined) out.dot_code = out.dotCode;
    delete out.dotCode;
    if (out.loadIndex !== undefined && out.load_index === undefined) out.load_index = out.loadIndex;
    delete out.loadIndex;
    if (out.condition !== undefined && out.tire_condition === undefined) out.tire_condition = out.condition;
    // The DB column is `tire_condition` only. A stray `condition` key makes
    // PostgREST reject the entire insert/update, so it must not be sent.
    delete out.condition;
    // Identity fields `sku` / `barcode` / `supplier` are already snake_case — they pass
    // through untouched in both directions.
  }
  // Keep client-generated UUIDs so local FK references stay valid after insert.
  // Strip legacy numeric Date.now() ids (and non-uuid temp ids) so the DB generates one.
  if (out.id !== undefined && !isUuid(out.id)) delete out.id;
  // Drop nested-only UI fields that have no DB column.
  delete out.salesHistory;
  // Drop empty-string uuid FKs (would fail `invalid input syntax for type uuid`).
  ["tire_id", "customer_id", "vehicle_id", "worker_id", "account_id"].forEach((k) => {
    if (out[k] === "") delete out[k];
  });
  return out;
}

function mapRowFromSupabase(table, row) {
  if (!row || typeof row !== "object") return row;
  const out = { ...row };
  if (table === "sales" && out.tire_id !== undefined && out.tireId === undefined) out.tireId = out.tire_id;
  if (table === "sales" && out.customer_name !== undefined && out.customerName === undefined)
    out.customerName = out.customer_name;
  if (table === "inventory" && out.tire_id !== undefined && out.tireId === undefined) out.tireId = out.tire_id;
  if (table === "deliveries" && out.tire_id !== undefined && out.tireId === undefined) out.tireId = out.tire_id;
  if (table === "deliveries" && out.date === undefined && out.created_at) {
    try {
      out.date = String(out.created_at).slice(0, 10);
    } catch (e) {
      // ignore
    }
  }
  if (table === "transactions" && out.account_id !== undefined && out.accountId === undefined) out.accountId = out.account_id;
  if (table === "accounts") {
    if (out.tax_id !== undefined && out.taxId === undefined) out.taxId = out.tax_id;
  }
  if (table === "invoices") {
    if (out.customer_id !== undefined && out.customerId === undefined) out.customerId = out.customer_id;
    if (out.due_date !== undefined && out.dueDate === undefined) out.dueDate = out.due_date;
    if (out.status !== undefined && INVOICE_STATUS_FROM_DB[out.status]) out.status = INVOICE_STATUS_FROM_DB[out.status];
    if (!Array.isArray(out.items)) out.items = [];
  }
  if (table === "hotel_tires") {
    if (out.customer_name !== undefined && out.customerName === undefined)
      out.customerName = out.customer_name;
    if (out.customer_id !== undefined && out.customerId === undefined)
      out.customerId = out.customer_id;
    if (out.storage_date !== undefined && out.storageDate === undefined)
      out.storageDate = out.storage_date || "";
    if (out.retrieval_date !== undefined && out.retrievalDate === undefined)
      out.retrievalDate = out.retrieval_date || "";
    if (out.plate_number !== undefined && out.plateNumber === undefined)
      out.plateNumber = out.plate_number;
    if (out.vehicle_model !== undefined && out.vehicleModel === undefined)
      out.vehicleModel = out.vehicle_model;
    if (out.photo_url !== undefined && out.photo === undefined) out.photo = out.photo_url;
    if (out.quantity !== undefined) out.quantity = Number(out.quantity) || 0;
    if (out.retrieved === undefined || out.retrieved === null) out.retrieved = false;
  }
  if (table === "hotel_customers" && out.id !== undefined) {
    // columns already match app shape (name, email, phone) — nothing to map.
  }
  if (table === "vehicles") {
    if (out.license_plate !== undefined && out.licensePlate === undefined)
      out.licensePlate = out.license_plate;
  }
  if (table === "services") {
    if (out.vehicle_id !== undefined && out.vehicleId === undefined)
      out.vehicleId = out.vehicle_id;
    if (out.customer_name !== undefined && out.customerName === undefined)
      out.customerName = out.customer_name;
    if (out.mechanic_name !== undefined && out.mechanicName === undefined)
      out.mechanicName = out.mechanic_name;
    if (out.work_done !== undefined && out.workDone === undefined)
      out.workDone = out.work_done;
    if (out.next_service_date !== undefined && out.nextServiceDate === undefined)
      out.nextServiceDate = out.next_service_date || "";
    if (out.date === undefined && out.created_at) {
      try {
        out.date = String(out.created_at).slice(0, 10);
      } catch (e) {
        // ignore
      }
    }
    if (out.cost !== undefined && out.cost !== null) out.cost = String(out.cost);
  }
  if (table === "workers") {
    // columns already match app shape (name, position, contact).
  }
  if (table === "tasks") {
    if (out.worker_id !== undefined && out.workerId === undefined)
      out.workerId = out.worker_id;
    if (out.completion_time !== undefined && out.completionTime === undefined)
      out.completionTime = out.completion_time || "";
    if (out.time !== undefined && out.time !== null) {
      const s = String(out.time);
      out.time = s.length >= 5 ? s.slice(0, 5) : s;
    }
    if (out.status !== undefined && TASK_STATUS_FROM_DB[out.status])
      out.status = TASK_STATUS_FROM_DB[out.status];
  }
  if (table === "task_comments" || table === "notifications") {
    if (out.task_id !== undefined && out.taskId === undefined) out.taskId = out.task_id;
  }
  if (table === "appointments") {
    if (out.customer_name !== undefined && out.customerName === undefined)
      out.customerName = out.customer_name;
    if (out.phone_number !== undefined && out.phoneNumber === undefined)
      out.phoneNumber = out.phone_number;
    if (out.send_reminder !== undefined && out.sendReminder === undefined)
      out.sendReminder = Boolean(out.send_reminder);
    // Rebuild ISO-ish date-times the UI parses (date picker + time display).
    if (out.date !== undefined && out.date) {
      const day = String(out.date).slice(0, 10);
      out.date = day;
      if (out.time) {
        const t = String(out.time).slice(0, 5);
        out.time = `${day}T${t}:00`;
      }
    }
    if (out.status !== undefined && APPT_STATUS_FROM_DB[out.status])
      out.status = APPT_STATUS_FROM_DB[out.status];
  }
  if (table === "profiles") {
    if (out.full_name !== undefined && out.name === undefined) out.name = out.full_name;
    if (out.shop_id !== undefined && out.shopId === undefined) out.shopId = out.shop_id;
  }
  if (table === "tires") {
    if (out.vehicle_type !== undefined && out.vehicleType === undefined) out.vehicleType = out.vehicle_type;
    if (out.image_urls !== undefined && out.images === undefined) out.images = out.image_urls;
    // Back-compat: price doubles as cost when cost_price is null (legacy rows).
    // NOTE: retail is deliberately NOT backfilled from price — price is cost,
    // and treating it as retail is what zeroed out profit in sale forms.
    if (out.cost_price !== undefined && out.costPrice === undefined) out.costPrice = out.cost_price;
    if (out.retail_price !== undefined && out.retailPrice === undefined) out.retailPrice = out.retail_price;
    if (out.costPrice === undefined || out.costPrice === null) out.costPrice = out.price;
    if (out.rack_location !== undefined && out.location === undefined) out.location = out.rack_location;
    if (out.dot_code !== undefined && out.dotCode === undefined) out.dotCode = out.dot_code;
    if (out.load_index !== undefined && out.loadIndex === undefined) out.loadIndex = out.load_index;
    if (out.tire_condition !== undefined && out.condition === undefined) out.condition = out.tire_condition;
    if (out.supplier !== undefined) out.supplier = out.supplier || '';
  }
  return out;
}

export async function loadTable(key) {
  const table = TABLE_MAP[key];
  if (!table || !isSupabaseConfigured()) return null; // null = cloud unavailable
  try {
    let query = supabase.from(table).select("*");
    // Tenant isolation: only the current shop's rows (profiles/shops rely on
    // RLS visibility instead — invites need cross-scope).
    if (TENANT_TABLES.has(table)) {
      const shopId = getCurrentShopId();
      if (!shopId) return null;
      query = query.eq("shop_id", shopId);
    }
    // Capped page for scale: 500 rows max per fetch (was 2000). Use
    // loadTablePage() for larger datasets instead of raising this.
    const { data, error } = await query.order("created_at", { ascending: false }).limit(500);
    if (error) {
      console.warn(`Supabase load ${table} failed:`, error.message);
      return null;
    }
    return (data || []).map((r) => mapRowFromSupabase(table, r));
  } catch (e) {
    console.warn(`Supabase load ${table} exception:`, e);
    return null;
  }
}

// Server-side pagination for scale (10k-50k concurrent).
// Returns { rows, hasMore } so UIs fetch 50-100 rows at a time instead of 2000.
export async function loadTablePage(key, opts = {}) {
  const { page = 0, pageSize = 100, orderBy = "created_at", ascending = false } = opts;
  const table = TABLE_MAP[key];
  if (!table || !isSupabaseConfigured()) return null;
  const size = Math.min(Math.max(Number(pageSize) || 100, 1), 500);
  const p = Math.max(Number(page) || 0, 0);
  const from = p * size;
  const to = from + size - 1;
  try {
    let query = supabase.from(table).select("*");
    if (TENANT_TABLES.has(table)) {
      const shopId = getCurrentShopId();
      if (!shopId) return null;
      query = query.eq("shop_id", shopId);
    }
    const { data, error } = await query.order(orderBy, { ascending }).range(from, to);
    if (error) {
      console.warn(`Supabase loadPage ${table} failed:`, error.message);
      return null;
    }
    const rows = (data || []).map((r) => mapRowFromSupabase(table, r));
    return { rows, hasMore: rows.length === size };
  } catch (e) {
    console.warn(`Supabase loadPage ${table} exception:`, e);
    return null;
  }
}

// Exact count for pagination UI (count only, no rows transferred).
export async function countTable(key) {
  const table = TABLE_MAP[key];
  if (!table || !isSupabaseConfigured()) return null;
  try {
    let query = supabase.from(table).select("id", { count: "exact", head: true });
    if (TENANT_TABLES.has(table)) {
      const shopId = getCurrentShopId();
      if (!shopId) return null;
      query = query.eq("shop_id", shopId);
    }
    const { count, error } = await query;
    if (error) {
      console.warn(`Supabase count ${table} failed:`, error.message);
      return null;
    }
    return count ?? 0;
  } catch (e) {
    console.warn(`Supabase count ${table} exception:`, e);
    return null;
  }
}

// ---------- Visible save errors ----------
// insert/update/delete used to fail silently (console.warn only) while the UI
// already showed the change — data looked saved until refresh. Every cloud
// mutation failure below is now also broadcast here; App.js subscribes and
// shows it, so a rejected write is never mistaken for a saved one.
const saveErrorListeners = new Set();

export function onSaveError(fn) {
  if (typeof fn !== "function") return () => {};
  saveErrorListeners.add(fn);
  return () => {
    saveErrorListeners.delete(fn);
  };
}

export function reportSaveError(table, op, message) {
  if (saveErrorListeners.size === 0) return;
  const detail = { table, op, message: String((message && message.message) || message || "unknown error") };
  saveErrorListeners.forEach((fn) => {
    try {
      fn(detail);
    } catch (e) {
      // listener failures must never break the save path
    }
  });
}

export async function insertRow(key, row) {
  const table = TABLE_MAP[key];
  if (!table || !isSupabaseConfigured()) return null;
  try {
    const payload = mapRowForSupabase(table, row);
    if (TENANT_TABLES.has(table)) {
      if (payload.shop_id === undefined || payload.shop_id === null || payload.shop_id === "") {
        payload.shop_id = getCurrentShopId() || null;
      }
      // Never write orphan tenant rows — they would vanish under RLS.
      if (!payload.shop_id) {
        console.warn(`Supabase insert ${table} skipped: no shop selected.`);
        reportSaveError(table, "insert", "no shop selected");
        return null;
      }
    }
    const { data, error } = await supabase.from(table).insert(payload).select().single();
    if (error) {
      console.warn(`Supabase insert ${table} failed:`, error.message);
      reportSaveError(table, "insert", error.message);
      return null;
    }
    if (data) {
      const saved = mapRowFromSupabase(table, data);
      auditWrite(table, "insert", saved);
      return saved;
    }
    return null;
  } catch (e) {
    console.warn(`Supabase insert ${table} exception:`, e);
    reportSaveError(table, "insert", e);
    return null;
  }
}

export async function updateRow(key, id, patch) {
  const table = TABLE_MAP[key];
  if (!table || !isSupabaseConfigured()) return null;
  if (id === undefined || id === null || !patch || typeof patch !== "object") return null;
  // Legacy numeric ids never exist remotely — nothing to update.
  if (!isUuid(id)) return null;
  try {
    const payload = mapRowForSupabase(table, patch);
    delete payload.id;
    delete payload.created_at;
    delete payload.shop_id;
    if (Object.keys(payload).length === 0) return null;
    let query = supabase.from(table).update(payload).eq("id", id);
    if (TENANT_TABLES.has(table)) {
      const shopId = getCurrentShopId();
      if (!shopId) return null;
      query = query.eq("shop_id", shopId);
    }
    const { data, error } = await query.select().single();
    if (error) {
      console.warn(`Supabase update ${table} failed:`, error.message);
      reportSaveError(table, "update", error.message);
      return null;
    }
    if (data) {
      const saved = mapRowFromSupabase(table, data);
      auditWrite(table, "update", saved);
      return saved;
    }
    return null;
  } catch (e) {
    console.warn(`Supabase update ${table} exception:`, e);
    reportSaveError(table, "update", e);
    return null;
  }
}

export async function deleteRow(key, id) {
  const table = TABLE_MAP[key];
  if (!table || !isSupabaseConfigured()) return false;
  if (id === undefined || id === null) return false;
  if (!isUuid(id)) return false;
  try {
    let query = supabase.from(table).delete().eq("id", id);
    if (TENANT_TABLES.has(table)) {
      const shopId = getCurrentShopId();
      if (!shopId) return false;
      query = query.eq("shop_id", shopId);
    }
    const { error } = await query;
    if (error) {
      console.warn(`Supabase delete ${table} failed:`, error.message);
      reportSaveError(table, "delete", error.message);
      return false;
    }
    auditWrite(table, "delete", { id });
    return true;
  } catch (e) {
    console.warn(`Supabase delete ${table} exception:`, e);
    reportSaveError(table, "delete", e);
    return false;
  }
}

// Remove child rows that reference a tire (inventory mirror + deliveries).
// Deliveries use ON DELETE SET NULL in SQL, so without this they linger as
// tire-less ghosts; inventory relies on CASCADE but explicit delete is harmless.
export async function deleteRowsByTireId(key, tireId) {
  const table = TABLE_MAP[key];
  if (!table || !isSupabaseConfigured()) return false;
  if (tireId === undefined || tireId === null) return false;
  if (!isUuid(tireId)) return false;
  try {
    let query = supabase.from(table).delete().eq("tire_id", tireId);
    if (TENANT_TABLES.has(table)) {
      const shopId = getCurrentShopId();
      if (!shopId) return false;
      query = query.eq("shop_id", shopId);
    }
    const { error } = await query;
    if (error) {
      console.warn(`Supabase delete-by-tire ${table} failed:`, error.message);
      reportSaveError(table, "delete", error.message);
      return false;
    }
    auditWrite(table, "delete", { id: tireId });
    return true;
  } catch (e) {
    console.warn(`Supabase delete-by-tire ${table} exception:`, e);
    reportSaveError(table, "delete", e);
    return false;
  }
}

// Keep the inventory mirror in Supabase equal to tires[].stock.
// Local inventory rows carry no remote id, so upsert on tire_id.
export async function upsertInventoryRow(tireId, quantity) {
  if (!isSupabaseConfigured()) return null;
  if (!isUuid(tireId)) return null;
  const shopId = getCurrentShopId();
  if (!shopId) return null;
  try {
    const qty = Number(quantity);
    const safeQty = Number.isNaN(qty) ? 0 : qty;
    const { data, error } = await supabase
      .from("inventory")
      .upsert(
        { tire_id: tireId, quantity: safeQty, shop_id: shopId, updated_at: new Date().toISOString() },
        { onConflict: "tire_id" }
      )
      .select()
      .single();
    if (error) {
      console.warn("Supabase upsert inventory failed:", error.message);
      reportSaveError("inventory", "upsert", error.message);
      return null;
    }
    if (data) {
      const saved = mapRowFromSupabase("inventory", data);
      auditWrite("inventory", "upsert", saved);
      return saved;
    }
    return null;
  } catch (e) {
    console.warn("Supabase upsert inventory exception:", e);
    reportSaveError("inventory", "upsert", e);
    return null;
  }
}

// Tire photo upload -> Supabase Storage (bucket tire-photos), fallback to dataURL.
export async function uploadTirePhoto(file) {
  if (!isSupabaseConfigured() || !file) return null;
  try {
    const ext = (file.name && file.name.split(".").pop()) || "jpg";
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("tire-photos").upload(path, file, { upsert: false });
    if (error) {
      console.warn("Supabase storage upload failed:", error.message);
      return null;
    }
    const { data } = supabase.storage.from("tire-photos").getPublicUrl(path);
    return data ? data.publicUrl : null;
  } catch (e) {
    console.warn("Supabase storage upload exception:", e);
    return null;
  }
}

// ---------- Realtime multi-device refresh ----------
// Pure list merges for postgres_changes events. Upsert-by-id dedupes the
// echo of this device's own optimistic writes, so no duplicates ever appear.
export function mergeUpsert(list, row) {
  if (!row || typeof row !== "object") return Array.isArray(list) ? list : [];
  const prev = Array.isArray(list) ? list : [];
  const id = row.id !== undefined && row.id !== null ? String(row.id) : "";
  if (!id) return [...prev, row];
  let found = false;
  const next = prev.map((r) => {
    if (r && String(r.id) === id) {
      found = true;
      return { ...r, ...row };
    }
    return r;
  });
  if (!found) next.push(row);
  return next;
}

export function mergeRemove(list, id) {
  if (id === undefined || id === null || id === "") return Array.isArray(list) ? list : [];
  return (Array.isArray(list) ? list : []).filter((r) => !r || String(r.id) !== String(id));
}

// Subscribe to one table's inserts/updates/deletes for the current shop.
// Returns an unsubscribe function. Safe to call when unconfigured (noop).
// RLS applies server-side: the client only receives rows it may read.
export function subscribeTable(key, handlers = {}) {
  const noop = () => {};
  if (!isSupabaseConfigured()) return noop;
  const table = TABLE_MAP[key];
  if (!table) return noop;
  const shopId = getCurrentShopId();
  try {
    const filter = TENANT_TABLES.has(table) && shopId ? `shop_id=eq.${shopId}` : undefined;
    const channel = supabase
      .channel(`bw-${table}-${shopId || "shared"}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          ...(filter ? { filter } : {}),
        },
        (payload) => {
          try {
            if (!payload) return;
            if (payload.eventType === "INSERT" && typeof handlers.onInsert === "function") {
              handlers.onInsert(mapRowFromSupabase(table, payload.new));
            } else if (payload.eventType === "UPDATE" && typeof handlers.onUpdate === "function") {
              handlers.onUpdate(mapRowFromSupabase(table, payload.new));
            } else if (
              payload.eventType === "DELETE" &&
              typeof handlers.onDelete === "function"
            ) {
              const gone = payload.old && payload.old.id;
              if (gone !== undefined && gone !== null) handlers.onDelete(gone);
            }
          } catch (e) {
            // a bad payload must never break the subscription
          }
        }
      )
      .subscribe();
    return () => {
      try {
        supabase.removeChannel(channel);
      } catch (e) {
        // ignore
      }
    };
  } catch (e) {
    return noop;
  }
}

