import { newId, isUuid, isSupabaseConfigured, onSaveError, reportSaveError, insertRow } from "./store";

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

test("save error emitter notifies subscribers then unsubscribes", () => {
  const seen = [];
  const off = onSaveError((d) => seen.push(d));
  reportSaveError("tires", "insert", new Error("boom"));
  expect(seen).toEqual([{ table: "tires", op: "insert", message: "boom" }]);
  off();
  reportSaveError("tires", "insert", "again");
  expect(seen.length).toBe(1);
});

test("reportSaveError without listeners is a safe no-op", () => {
  expect(() => reportSaveError("tires", "insert", "plain")).not.toThrow();
  expect(() => onSaveError(null)).not.toThrow();
});

test("unconfigured insert returns null without emitting", async () => {
  let calls = 0;
  const off = onSaveError(() => {
    calls += 1;
  });
  try {
    await expect(insertRow("tires", { brand: "x" })).resolves.toBeNull();
    expect(calls).toBe(0);
  } finally {
    off();
  }
});
