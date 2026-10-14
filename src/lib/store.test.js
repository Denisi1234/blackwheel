import { newId, isUuid, isSupabaseConfigured } from "./store";

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
