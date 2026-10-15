// Shared professional document kit — one visual identity for every download.
// Company header (from Settings), navy styling, footers with page numbers,
// BOM-safe CSV and column-fitted Excel exports.
import "jspdf-autotable";
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import { getCompany, formatMoney, getVatRate, getCurrency } from "./settings";
import { getAppLang } from "../components/i18n";

export const DOC_BRAND = {
  primary: [23, 55, 120],
  accent: [37, 99, 235],
  muted: [100, 116, 139],
  line: [226, 232, 240],
  lightFill: [241, 245, 249],
  paid: [22, 163, 74],
  unpaid: [217, 119, 6],
};

export function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

export function docLocale() {
  try {
    return getAppLang() === 'sw' ? 'sw-TZ' : undefined;
  } catch (e) {
    return undefined;
  }
}

export function fmtDate(value) {
  if (!value) return "";
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString(docLocale());
  } catch (e) {
    return String(value);
  }
}

export function companyInfo() {
  let c = {};
  try {
    c = getCompany() || {};
  } catch (e) {
    c = {};
  }
  return {
    name: c.name || "Black Wheel",
    phone: c.phone || "",
    email: c.email || "",
    address: c.address || "",
    taxId: c.taxId || "",
  };
}

export function money(amount, currency) {
  try {
    return formatMoney(amount, currency);
  } catch (e) {
    return `${Number(amount || 0).toFixed(2)} ${currency || ""}`.trim();
  }
}

// Navy header band: company left, document title right. Returns content start Y.
export function paintHeader(doc, { title, refNo = "" }) {
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(...DOC_BRAND.primary);
  doc.rect(0, 0, W, 38, "F");

  const co = companyInfo();
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(String(co.name).slice(0, 42), 14, 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(200, 212, 235);
  const contact = [co.address, [co.phone, co.email].filter(Boolean).join("  ·  ")]
    .filter(Boolean)
    .join("  ·  ")
    .slice(0, 90);
  if (contact) doc.text(contact, 14, 21);
  if (co.taxId) doc.text(`Tax ID: ${String(co.taxId).slice(0, 30)}`, 14, 26);

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(String(title || "").toUpperCase().slice(0, 24), W - 14, 17, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(200, 212, 235);
  const rightLine = [refNo, todayStamp()].filter(Boolean).join("  ·  ").slice(0, 48);
  doc.text(rightLine, W - 14, 25, { align: "right" });

  doc.setDrawColor(...DOC_BRAND.line);
  return 46;
}

// Footer on every page: rule + page number + label + generation date.
export function paintFooter(doc, leftLabel = "") {
  try {
    const n = doc.internal.getNumberOfPages();
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    for (let i = 1; i <= n; i += 1) {
      doc.setPage(i);
      doc.setDrawColor(...DOC_BRAND.line);
      doc.setLineWidth(0.3);
      doc.line(14, H - 14, W - 14, H - 14);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...DOC_BRAND.muted);
      if (leftLabel) doc.text(String(leftLabel).slice(0, 60), 14, H - 9);
      doc.text(`Page ${i} / ${n}`, W - 14, H - 9, { align: "right" });
      doc.text(`Generated ${todayStamp()}`, W - 14, H - 5.5, { align: "right" });
    }
  } catch (e) {
    // never break a download over footer cosmetics
  }
}

// Consistently styled data table. moneyCols = column indexes right-aligned.
export function moneyTable(doc, { startY, head, body, foot = null, moneyCols = [] }) {
  const columnStyles = {};
  (moneyCols || []).forEach((idx) => {
    columnStyles[idx] = { halign: "right" };
  });
  doc.autoTable({
    startY,
    head,
    body,
    foot,
    theme: "striped",
    styles: { fontSize: 9, cellPadding: 3, textColor: [30, 41, 59] },
    headStyles: {
      fillColor: DOC_BRAND.primary,
      textColor: 255,
      fontStyle: "bold",
      fontSize: 9,
    },
    footStyles: {
      fillColor: DOC_BRAND.lightFill,
      textColor: [15, 23, 42],
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles,
    margin: { left: 14, right: 14 },
  });
  try {
    return doc.lastAutoTable.finalY;
  } catch (e) {
    return startY + 20;
  }
}

// Section caption, e.g. "Bill To". Returns next Y.
export function sectionCaption(doc, text, y) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...DOC_BRAND.primary);
  doc.text(String(text).toUpperCase().slice(0, 40), 14, y);
  return y + 5;
}

export function metaLine(doc, label, value, x, y, maxWidth = 85) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...DOC_BRAND.muted);
  doc.text(`${label}:`, x, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(15, 23, 42);
  doc.text(String(value ?? "—").slice(0, 60), x, y + 4.5, { maxWidth });
  return y + 10;
}

// UTF-8 BOM + RFC-4180 quoting so Excel opens it cleanly.
export function downloadCsv(filename, headers, rows) {
  const escapeCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [
    (headers || []).map(escapeCell).join(","),
    ...((rows || []).map((r) => (r || []).map(escapeCell).join(","))),
  ];
  const csv = `\uFEFF${lines.join("\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Excel with fitted columns and a frozen header row.
export function downloadExcel(filename, sheetName, rows, colWidths = []) {
  const ws = XLSX.utils.json_to_sheet(rows || []);
  if (Array.isArray(colWidths) && colWidths.length > 0) {
    ws["!cols"] = colWidths.map((wch) => ({ wch }));
  } else if ((rows || []).length > 0) {
    const keys = Object.keys(rows[0] || {});
    ws["!cols"] = keys.map((k) => {
      const longest = Math.max(
        String(k).length,
        ...rows.slice(0, 200).map((r) => String(r?.[k] ?? "").length)
      );
      return { wch: Math.min(48, Math.max(12, longest + 2)) };
    });
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName || "Sheet1");
  XLSX.writeFile(wb, filename);
}

export function datedName(base, ext) {
  return `${base}_${todayStamp()}.${ext}`;
}

// One-page sale receipt PDF: customer, tire line, VAT totals, signatures.
// Same visual identity as the hotel receipt (paintHeader/moneyTable/paintFooter).
export function downloadSaleReceipt(sale = {}, tire = {}) {
  const doc = new jsPDF();
  const cur = sale.currency || tire.currency || getCurrency();
  const qty = Number(sale.quantity) || 0;
  const unit = Number(sale.price) || 0;
  const subtotal = qty * unit;
  const vatRate = getVatRate();
  const vat = (subtotal * vatRate) / 100;
  const total = subtotal + vat;
  const refNo = `RCPT-${String(sale.date || todayStamp()).slice(0, 10)}-${String(sale.id || "").slice(0, 8).toUpperCase()}`;
  const startY = paintHeader(doc, { title: "Sale Receipt", refNo });

  let y = sectionCaption(doc, "Customer", startY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(String(sale.customerName || "Walk-in customer").slice(0, 48), 14, y + 1);
  y = metaLine(doc, "Date", fmtDate(sale.date) || todayStamp(), 14, y + 8);
  y = metaLine(doc, "Currency", cur, 110, y - 10);

  y = sectionCaption(doc, "Items", y + 4);
  const label = [tire.brand, tire.size, tire.year].filter(Boolean).join(" ").slice(0, 42) || "Tire";
  y = moneyTable(
    doc,
    {
      startY: y,
      head: [["Tire", "Qty", "Unit price", "Total"]],
      body: [[label, String(qty), money(unit, cur), money(subtotal, cur)]],
      foot: [
        ["", "", "Subtotal", money(subtotal, cur)],
        ["", "", `VAT (${vatRate}%)`, money(vat, cur)],
        ["", "", "TOTAL", money(total, cur)],
      ],
      moneyCols: [1, 2, 3],
    }
  );

  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("Customer signature", 14, y);
  doc.text("Staff signature", 110, y);
  doc.setDrawColor(...DOC_BRAND.muted);
  doc.line(14, y + 12, 90, y + 12);
  doc.line(110, y + 12, 186, y + 12);

  paintFooter(doc, `Sale receipt ${String(sale.customerName || "").slice(0, 40)}`);
  doc.save(datedName("sale_receipt", "pdf"));
}
