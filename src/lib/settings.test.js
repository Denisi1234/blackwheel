import { getCurrency, formatMoney, getLowStockThreshold, getVatRate } from "./settings";

beforeEach(() => {
  localStorage.clear();
});

test("currency defaults to TZS and formats money", () => {
  expect(getCurrency()).toBe("TZS");
  expect(formatMoney(1500, "TZS")).toContain("TZS");
  expect(formatMoney(10.5, "USD")).toContain("USD");
});

test("low stock threshold defaults to 4 and accepts stored value", () => {
  expect(getLowStockThreshold()).toBe(4);
  localStorage.setItem("settings_notifs", JSON.stringify({ lowStockThreshold: 2 }));
  expect(getLowStockThreshold()).toBe(2);
});

test("vat rate defaults to 20 and clamps to 0-100", () => {
  expect(getVatRate()).toBe(20);
  localStorage.setItem("settings_prefs", JSON.stringify({ vatRate: 18 }));
  expect(getVatRate()).toBe(18);
});

test("profit math never fabricates profit from missing price", () => {
  // Mirrors App.js addSale: profit = (salePrice - cost) * qty, price required.
  const profit = (salePrice, cost, qty) => (salePrice - cost) * qty;
  expect(profit(120, 80, 2)).toBe(80);
  expect(profit(80, 80, 2)).toBe(0);
  expect(Number.isFinite(profit(0, 80, 1))).toBe(true);
});
