import { newId, isUuid, isSupabaseConfigured, selectPendingUploads, sanitizeSyncRow, SYNC_KEYS_ORDER, cacheKeyFor, cacheGet, cacheSet, getCurrentShopId, setCurrentShopId } from "./store";

test("newId generates unique string ids", () => {
  const a = newId();
  const b = newId();
  expect(typeof a).toBe("string");
  expect(a.length).toBeGreaterThan(0);
  expect(a).not.toBe(b);
});

test("isUuid accepts real uuids", () => {
  expect(isUuid("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
});

test("isUuid rejects legacy numeric ids", () => {
  expect(isUuid(String(Date.now()))).toBe(false);
  expect(isUuid("not-a-uuid")).toBe(false);
  expect(isUuid(null)).toBe(false);
});

test("supabase not configured with placeholder env", () => {
  // .env.example placeholders must never count as configured.
  expect(isSupabaseConfigured()).toBe(false);
});

test("selectPendingUploads skips ids already in the cloud", () => {
  const local = [{ id: "a" }, { id: "b" }, { id: "c" }, { name: "no-id" }, null];
  const remote = new Set(["a", "c"]);
  const pending = selectPendingUploads(local, remote);
  expect(pending).toEqual([{ id: "b" }, { name: "no-id" }]);
});

test("selectPendingUploads tolerates non-array input", () => {
  expect(selectPendingUploads(null, new Set())).toEqual([]);
  expect(selectPendingUploads(undefined)).toEqual([]);
});

test("sanitizeSyncRow keeps known uuid FK references", () => {
  const tire = "123e4567-e89b-12d3-a456-426614174000";
  const { row, skip } = sanitizeSyncRow(
    "sales",
    { id: "x", tireId: tire },
    { tires: new Set([tire]) }
  );
  expect(skip).toBe(false);
  expect(row.tireId).toBe(tire);
});

test("sanitizeSyncRow strips unknown and legacy FK references", () => {
  const unknown = "123e4567-e89b-12d3-a456-426614174000";
  const r1 = sanitizeSyncRow("sales", { id: "x", tireId: unknown }, { tires: new Set() });
  expect(r1.skip).toBe(false);
  expect(r1.row.tireId).toBeUndefined();
  const r2 = sanitizeSyncRow("deliveries", { id: "y", tire_id: "1729000000000" }, { tires: new Set() });
  expect(r2.skip).toBe(false);
  expect(r2.row.tire_id).toBeUndefined();
});

test("sanitizeSyncRow skips rows with unknown NOT NULL FK parents", () => {
  const unknown = "123e4567-e89b-12d3-a456-426614174000";
  const r1 = sanitizeSyncRow("services", { id: "s", vehicleId: unknown }, { vehicles: new Set() });
  expect(r1.skip).toBe(true);
  const r2 = sanitizeSyncRow("transactions", { id: "t", account_id: unknown }, { accounts: new Set() });
  expect(r2.skip).toBe(true);
});

test("sync order lists parents before children", () => {  const before = (parent, child) => {
    expect(SYNC_KEYS_ORDER.indexOf(parent)).toBeGreaterThanOrEqual(0);
    expect(SYNC_KEYS_ORDER.indexOf(child)).toBeGreaterThanOrEqual(0);
    expect(SYNC_KEYS_ORDER.indexOf(parent)).toBeLessThan(SYNC_KEYS_ORDER.indexOf(child));
  };
  before("tires", "sales");
  before("tires", "inventory");
  before("tires", "deliveries");
  before("hotelCustomers", "hotelTires");
  before("vehicles", "services");
  before("workers", "tasks");
  before("accounts", "transactions");
  before("accounts", "invoices");
});

function withShopEnv(shopId) {
  const prevUrl = process.env.REACT_APP_SUPABASE_URL;
  const prevKey = process.env.REACT_APP_SUPABASE_ANON_KEY;
  const prevShop = getCurrentShopId();
  process.env.REACT_APP_SUPABASE_URL = "https://demo-shop.supabase.co";
  process.env.REACT_APP_SUPABASE_ANON_KEY = "demo-anon-key";
  setCurrentShopId(shopId);
  return () => {
    if (prevUrl === undefined) delete process.env.REACT_APP_SUPABASE_URL;
    else process.env.REACT_APP_SUPABASE_URL = prevUrl;
    if (prevKey === undefined) delete process.env.REACT_APP_SUPABASE_ANON_KEY;
    else process.env.REACT_APP_SUPABASE_ANON_KEY = prevKey;
    setCurrentShopId(prevShop);
  };
}

test("cache keys stay plain when supabase is not configured", () => {
  expect(cacheKeyFor("tires")).toBe("tires");
});

test("cache keys are namespaced by shop when cloud is on", () => {
  const restore = withShopEnv("shop-aaa");
  try {
    expect(cacheKeyFor("tires")).toBe("tires::shop-aaa");
  } finally {
    restore();
  }
});

test("cache keys stay plain with no shop selected", () => {
  const restore = withShopEnv("");
  try {
    expect(cacheKeyFor("tires")).toBe("tires");
  } finally {
    restore();
  }
});

test("cache roundtrip isolates shops from each other", () => {
  const restore = withShopEnv("shop-aaa");
  try {
    expect(cacheSet("iso_tires", [{ id: "a1" }])).toBe(true);
    expect(cacheGet("iso_tires", [])).toEqual([{ id: "a1" }]);
    setCurrentShopId("shop-bbb");
    expect(cacheGet("iso_tires", [])).toEqual([]);
    expect(cacheSet("iso_tires", [{ id: "b1" }])).toBe(true);
    setCurrentShopId("shop-aaa");
    expect(cacheGet("iso_tires", [])).toEqual([{ id: "a1" }]);
  } finally {
    restore();
  }
  localStorage.removeItem("iso_tires::shop-aaa");
  localStorage.removeItem("iso_tires::shop-bbb");
});

test("legacy global cache is adopted once into the shop scope", () => {
  localStorage.setItem("adopt_me", JSON.stringify([{ id: "legacy1" }]));
  const restore = withShopEnv("shop-aaa");
  try {
    expect(cacheGet("adopt_me", [])).toEqual([{ id: "legacy1" }]);
    expect(localStorage.getItem("adopt_me")).toBeNull();
    expect(JSON.parse(localStorage.getItem("adopt_me::shop-aaa"))).toEqual([{ id: "legacy1" }]);
  } finally {
    restore();
  }
  localStorage.removeItem("adopt_me");
  localStorage.removeItem("adopt_me::shop-aaa");
});
