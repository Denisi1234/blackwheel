import { newId, isUuid, isSupabaseConfigured, onSaveError, reportSaveError, insertRow, mergeUpsert, mergeRemove, subscribeTable } from "./store";

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

test("mergeUpsert adds new rows and merges known ids", () => {
  const one = mergeUpsert([], { id: "a", stock: 1 });
  expect(one).toEqual([{ id: "a", stock: 1 }]);
  const two = mergeUpsert(one, { id: "b", stock: 2 });
  expect(two.length).toBe(2);
  const merged = mergeUpsert(two, { id: "a", stock: 5 });
  expect(merged.length).toBe(2);
  expect(merged.find((r) => r.id === "a").stock).toBe(5);
  expect(mergeUpsert(null, null)).toEqual([]);
});

test("mergeRemove drops by id and tolerates junk", () => {
  const list = [{ id: "a" }, { id: "b" }];
  expect(mergeRemove(list, "a")).toEqual([{ id: "b" }]);
  expect(mergeRemove(list, "zzz")).toEqual(list);
  expect(mergeRemove(null, "a")).toEqual([]);
  expect(mergeRemove(list)).toEqual(list);
});

test("subscribeTable is a safe noop when unconfigured", () => {
  const off = subscribeTable("tires", { onInsert: () => { throw new Error("must not run"); } });
  expect(typeof off).toBe("function");
  expect(() => off()).not.toThrow();
  expect(typeof subscribeTable("nope", {})).toBe("function");
});
