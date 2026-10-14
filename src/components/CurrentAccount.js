import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Grid,
  Typography,
  Paper,
  TextField,
  Button,
  List,
  ListItem,
  ListItemText,
  Divider,
  IconButton,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Slide,
  Chip,
  Box,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Menu,
  MenuItem,
  TableSortLabel,
  TablePagination,
  Drawer,
  ListItemIcon,
  Tabs,
  Tab,
  FormControl,
  InputLabel,
  Select,
  Snackbar,
  Alert,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip,
} from "@mui/material";
import { styled } from "@mui/material/styles";
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  AttachMoney as AttachMoneyIcon,
  MoneyOff as MoneyOffIcon,
  MoreVert as MoreVertIcon,
  Dashboard as DashboardIcon,
  People as PeopleIcon,
  Settings as SettingsIcon,
  ExitToApp as ExitToAppIcon,
  ExpandMore as ExpandMoreIcon,
  Receipt as ReceiptIcon,
  LocalAtm as LocalAtmIcon,
  TrendingUp as TrendingUpIcon,
  AccountBalanceWallet as AccountBalanceWalletIcon,
} from "@mui/icons-material";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts";
import { jsPDF } from "jspdf";
import "jspdf-autotable";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import Fab from "@mui/material/Fab";
import SuccessModal from "./SuccessModal";
import { getVatRate, getCurrency, formatMoney } from "../lib/settings";
import {
  loadTable,
  insertRow,
  updateRow,
  deleteRow,
  newId,
  isUuid,
  isSupabaseConfigured,
} from "../lib/store";
import { formatTireLabel } from "../lib/tireIdentity";
import {
  DOC_BRAND,
  paintHeader,
  paintFooter,
  moneyTable,
  money,
  fmtDate,
  sectionCaption,
  downloadCsv,
  datedName,
} from "../lib/documents";

const drawerWidth = 240;

const handleDownloadInvoice = (invoice) => {
  const doc = new jsPDF();
  const safeInvoice = invoice || {};
  const safeItems = Array.isArray(safeInvoice.items) ? safeInvoice.items : [];
  const safeTotal = Number(safeInvoice.total || 0);
  const safeCurrency = safeInvoice.currency || getCurrency();
  const vatPct = getVatRate();
  const vatRate = vatPct / 100;
  const paid = safeInvoice.status === "Paid";

  let y = paintHeader(doc, { title: "Invoice", refNo: safeInvoice.number || "" });
  const W = doc.internal.pageSize.getWidth();

  // Status stamp (top-right under header)
  const stampColor = paid ? DOC_BRAND.paid : DOC_BRAND.unpaid;
  doc.setFillColor(...stampColor);
  doc.roundedRect(W - 54, y - 8, 40, 10, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(paid ? "PAID" : "UNPAID", W - 34, y - 1, { align: "center" });

  // Bill-to + meta columns
  y = sectionCaption(doc, "Bill to", y + 6);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(String(safeInvoice.customerName || "—").slice(0, 48), 14, y + 1);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...DOC_BRAND.muted);
  let billY = y + 7;
  if (safeInvoice.customerId) {
    doc.text(`Customer ref: ${String(safeInvoice.customerId).slice(0, 18)}`, 14, billY);
    billY += 5;
  }

  const metaX = 130;
  const meta = (label, value, row) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...DOC_BRAND.muted);
    doc.text(`${label}`, metaX, y - 4 + row * 7, { align: "left" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(String(value ?? "—").slice(0, 32), W - 14, y - 4 + row * 7, { align: "right" });
  };
  meta("Invoice No.", safeInvoice.number || "—", 0);
  meta("Issue date", fmtDate(safeInvoice.date) || "—", 1);
  meta("Due date", fmtDate(safeInvoice.dueDate) || "—", 2);
  meta("Currency", safeCurrency, 3);

  // Items
  const body = safeItems.map((item, idx) => {
    const qty = Number(item.quantity || 0);
    const price = Number(item.price || 0);
    return [
      String(idx + 1),
      String(item.description || "—").slice(0, 60),
      String(qty),
      money(price, safeCurrency),
      money(qty * price, safeCurrency),
    ];
  });
  const subtotal = safeTotal - (safeTotal * vatRate) / (1 + vatRate);
  const vatAmount = (safeTotal * vatRate) / (1 + vatRate);
  y = moneyTable(doc, {
    startY: Math.max(billY, y + 26),
    head: [["#", "Description", "Qty", "Unit Price", "Amount"]],
    body: body.length > 0 ? body : [["—", "No items", "", "", ""]],
    foot: [
      ["", "", "", "Subtotal:", money(subtotal, safeCurrency)],
      ["", "", "", `VAT (${vatPct}%):`, money(vatAmount, safeCurrency)],
      ["", "", "", "Grand Total:", money(safeTotal, safeCurrency)],
    ],
    moneyCols: [2, 3, 4],
  });

  // Totals emphasis + thank-you
  y += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...DOC_BRAND.muted);
  doc.text(
    paid
      ? "Paid in full — thank you for your business."
      : "Please settle this invoice on or before the due date. Thank you.",
    14,
    y,
    { maxWidth: 180 }
  );

  paintFooter(doc, `Invoice ${safeInvoice.number || ""}`);
  doc.save(`Invoice_${safeInvoice.number || "draft"}.pdf`);
};

const Main = styled("main", { shouldForwardProp: (prop) => prop !== "open" })(
  ({ theme, open }) => ({
    flexGrow: 1,
    padding: theme.spacing(3),
    transition: theme.transitions.create("margin", {
      easing: theme.transitions.easing.sharp,
      duration: theme.transitions.duration.leavingScreen,
    }),
    marginLeft: `-${drawerWidth}px`,
    ...(open && {
      transition: theme.transitions.create("margin", {
        easing: theme.transitions.easing.easeOut,
        duration: theme.transitions.duration.enteringScreen,
      }),
      marginLeft: 0,
    }),
  })
);

const MetricCard = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(2),
  height: "100%",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  textAlign: "center",
  background: theme.palette.background.paper,
  color: theme.palette.text.primary,
  transition: "transform 0.3s ease-in-out, box-shadow 0.3s ease-in-out",
  "&:hover": {
    transform: "translateY(-5px)",
    boxShadow: theme.shadows[8],
  },
}));

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042"];

const Transition = React.forwardRef((props, ref) => (
  <Slide direction="up" ref={ref} {...props} />
));

const CurrentAccount = ({ tires = [], sales = [], deliveries = [], user = null, shop = null }) => {
  const isLedgerAdmin =
    !isSupabaseConfigured() ||
    shop?.role === "Admin" ||
    user?.role === "Admin";
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const loadedRef = useRef(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [accountDetails, setAccountDetails] = useState({
    name: "",
    receivable: 0,
    payable: 0,
    email: "",
    phone: "",
    address: "",
    taxId: "",
    category: "",
    currency: "TZS",
  });
  const [filter, setFilter] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [sortDirection, setSortDirection] = useState("asc");
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [openTransactionDialog, setOpenTransactionDialog] = useState(false);
  const [transactionDetails, setTransactionDetails] = useState({
    type: "receivable",
    amount: 0,
    description: "",
    date: new Date().toISOString().split("T")[0],
    currency: "TZS",
  });
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [ledgerAccountId, setLedgerAccountId] = useState("all");
  const [openDrawer, setOpenDrawer] = useState(false);
  const [currentTab, setCurrentTab] = useState(0);
  const [dateRange, setDateRange] = useState({ start: "", end: "" });
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "success",
  });
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [successModal, setSuccessModal] = useState({
    open: false,
    title: "",
    message: "",
    details: [],
  });
  const [openInvoiceDialog, setOpenInvoiceDialog] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState({ open: false, kind: null, id: null });
  const [editingInvoiceId, setEditingInvoiceId] = useState(null);
  const [invoiceDetails, setInvoiceDetails] = useState({
    number: "",
    date: new Date().toISOString().split("T")[0],
    dueDate: "",
    items: [],
    total: 0,
    tax: 0,
    currency: "TZS",
    customerId: "",
  });
  const [currencies] = useState(["TZS", "USD", "EUR", "GBP"]);

  const safeParse = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (e) {
      return fallback;
    }
  };

  const safeSave = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // ignore quota errors — Supabase stays source of truth when configured
    }
  };

  // Supabase-first load; localStorage fallback keeps the module working offline.
  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      try {
        const [remoteAccounts, remoteTransactions, remoteInvoices] =
          await Promise.all([
            loadTable("accounts"),
            loadTable("transactions"),
            loadTable("invoices"),
          ]);
        let nextAccounts =
          remoteAccounts !== null ? remoteAccounts : safeParse("accounts", []);
        let nextTransactions =
          remoteTransactions !== null
            ? remoteTransactions
            : safeParse("accountTransactions", []);
        const nextInvoices =
          remoteInvoices !== null ? remoteInvoices : safeParse("invoices", []);
        // One-time migration: legacy rows nested transactions inside accounts.
        // Flatten them so old browsers keep their history in the new model.
        const flattened = [];
        nextAccounts = (nextAccounts || []).map((acc) => {
          if (acc && Array.isArray(acc.transactions)) {
            acc.transactions.forEach((t) => {
              if (t) {
                flattened.push({
                  ...t,
                  id: t.id ?? newId(),
                  accountId: acc.id,
                });
              }
            });
            const { transactions: _drop, ...rest } = acc;
            return rest;
          }
          return acc;
        });
        if (flattened.length > 0 && (nextTransactions || []).length === 0) {
          nextTransactions = flattened;
          flattened.forEach((t) => {
            if (isUuid(t.accountId)) insertRow("transactions", t);
          });
        }
        setAccounts(nextAccounts || []);
        setTransactions(nextTransactions || []);
        setInvoices(nextInvoices || []);
      } catch (error) {
        console.error("Error fetching accounts:", error);
        setSnackbar({
          open: true,
          message: "An error occurred while loading accounts.",
          severity: "error",
        });
      } finally {
        setLoading(false);
        loadedRef.current = true;
      }
    };

    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Local mirror (offline fallback) — Supabase writes happen per-action below.
  useEffect(() => {
    if (!loadedRef.current) return;
    safeSave("accounts", accounts);
  }, [accounts]);

  useEffect(() => {
    if (!loadedRef.current) return;
    safeSave("accountTransactions", transactions);
  }, [transactions]);

  useEffect(() => {
    if (!loadedRef.current) return;
    safeSave("invoices", invoices);
  }, [invoices]);

  const transactionsOf = (accountId) =>
    (transactions || []).filter(
      (t) => String(t?.accountId) === String(accountId)
    );

  // Void a MANUAL ledger line (auto-posted [sale:]/[delivery:] lines are
  // voided by deleting their source sale/delivery — the effect above
  // reverses them). Balance is reversed exactly.
  const handleVoidTransaction = (tx) => {
    if (!tx) return;
    if (/\[(sale|delivery):/.test(String(tx?.description || ""))) return;
    const ok =
      typeof window === "undefined" ||
      window.confirm(
        `Void this ${tx.type === "payable" ? "payable" : "receivable"} of ${formatMoney(tx.amount, tx.currency)}? The account balance will be reversed.`
      );
    if (!ok) return;
    const amt = Number(tx.amount) || 0;
    const type = tx.type === "payable" ? "payable" : "receivable";
    const key = String(tx.id);
    setTransactions((prev) => (prev || []).filter((t) => String(t?.id) !== key));
    setAccounts((prev) =>
      (prev || []).map((a) =>
        String(a?.id) === String(tx.accountId)
          ? { ...a, [type]: Number(a?.[type] || 0) - amt }
          : a
      )
    );
    const owner = (accounts || []).find((a) => String(a?.id) === String(tx.accountId));
    if (owner) {
      updateRow("accounts", owner.id, {
        [type]: Number(owner[type] || 0) - amt,
      });
    }
    deleteRow("transactions", tx.id);
    showSnackbar("Transaction voided — balance reversed.", "success");
  };

  const ledgerRows = useMemo(() => {
    const rows =
      ledgerAccountId === "all"
        ? transactions || []
        : transactionsOf(ledgerAccountId);
    return [...rows].sort((a, b) =>
      String(b?.date || "").localeCompare(String(a?.date || ""))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, ledgerAccountId]);

  // ---- Cross-module ledger posting -------------------------------------
  // Every recorded sale becomes a receivable on the customer's account;
  // every stock delivery becomes a payable on the supplier's account.
  // Idempotent via [sale:ID] / [delivery:ID] tags — re-renders and reloads
  // never double-post. Rows persist to Supabase when configured.
  useEffect(() => {
    if (!loadedRef.current) return;
    const posted = new Set();
    (transactions || []).forEach((t) => {
      const m = String(t?.description || "").match(
        /\[(sale|delivery):([^\]]+)\]/
      );
      if (m) posted.add(`${m[1]}:${m[2]}`);
    });

    let accList = accounts || [];
    let txList = transactions || [];
    let changed = false;

    // Garbage-collect postings whose source sale/delivery was voided:
    // reverse the booking exactly, then drop the line. Balances stay exact.
    const reverseTx = (tx) => {
      const amt = Number(tx?.amount) || 0;
      const type = tx?.type === "payable" ? "payable" : "receivable";
      accList = accList.map((a) =>
        String(a?.id) === String(tx?.accountId)
          ? { ...a, [type]: Number(a?.[type] || 0) - amt }
          : a
      );
      const owner = accList.find((a) => String(a?.id) === String(tx?.accountId));
      if (owner && isUuid(owner.id)) {
        updateRow("accounts", owner.id, { [type]: owner[type] });
      }
      if (tx && isUuid(tx.id)) deleteRow("transactions", tx.id);
      changed = true;
    };

    const liveSaleIds = new Set((sales || []).map((s) => String(s?.id)));
    const liveDeliveryIds = new Set((deliveries || []).map((d) => String(d?.id)));
    txList = txList.filter((t) => {
      const m = String(t?.description || "").match(/\[(sale|delivery):([^\]]+)\]/);
      if (!m) return true;
      const alive = m[1] === "sale" ? liveSaleIds.has(m[2]) : liveDeliveryIds.has(m[2]);
      if (!alive) {
        reverseTx(t);
        return false;
      }
      return true;
    });

    const ensureAccount = (name, kind) => {
      const clean =
        String(name || "").trim() ||
        (kind === "supplier" ? "Unknown Supplier" : "Walk-in Customer");
      const found = accList.find(
        (a) =>
          String(a?.name || "").trim().toLowerCase() === clean.toLowerCase()
      );
      if (found) return found;
      const created = {
        id: newId(),
        name: clean,
        receivable: 0,
        payable: 0,
        email: "",
        phone: "",
        address: "",
        taxId: "",
        category: kind === "supplier" ? "Supplier" : "Customer",
        currency: getCurrency(),
      };
      accList = [...accList, created];
      insertRow("accounts", created);
      changed = true;
      return created;
    };

    const postTx = (account, type, amount, description, date, currency) => {
      const tx = {
        id: newId(),
        accountId: account.id,
        type,
        amount,
        description,
        date: date || new Date().toISOString().slice(0, 10),
        currency: currency || account.currency || getCurrency(),
      };
      txList = [...txList, tx];
      accList = accList.map((a) =>
        String(a?.id) === String(account.id)
          ? { ...a, [type]: Number(a?.[type] || 0) + amount }
          : a
      );
      if (isUuid(account.id)) {
        insertRow("transactions", tx);
        const updated = accList.find(
          (a) => String(a?.id) === String(account.id)
        );
        if (updated) updateRow("accounts", account.id, { [type]: updated[type] });
      }
      changed = true;
    };

    (sales || []).forEach((s) => {
      if (!s || s.id === undefined || s.id === null) return;
      if (posted.has(`sale:${String(s.id)}`)) return;
      const amount = Number(s.price || 0) * Number(s.quantity || 0);
      if (!(amount > 0)) return;
      const tire = (tires || []).find(
        (t) => String(t?.id) === String(s.tireId)
      );
      const label = tire ? formatTireLabel(tire) : "Tire sale";
      const account = ensureAccount(s.customerName, "customer");
      postTx(
        account,
        "receivable",
        amount,
        `Tire sale — ${label} (${s.quantity} pcs) [sale:${s.id}]`,
        s.date,
        s.currency || tire?.currency
      );
    });

    (deliveries || []).forEach((d) => {
      if (!d || d.id === undefined || d.id === null) return;
      if (posted.has(`delivery:${String(d.id)}`)) return;
      const tire = (tires || []).find(
        (t) => String(t?.id) === String(d.tireId)
      );
      const qty = Number(d.quantity || 0);
      const unitCost = Number(tire?.costPrice ?? tire?.price ?? 0);
      const amount = qty * unitCost;
      if (!(qty > 0) || !(amount > 0)) return;
      const account = ensureAccount(tire?.supplier, "supplier");
      postTx(
        account,
        "payable",
        amount,
        `Stock purchase — ${tire ? formatTireLabel(tire) : "tires"} (${qty} pcs) [delivery:${d.id}]`,
        d.date,
        tire?.currency
      );
    });

    if (changed) {
      setAccounts(accList);
      setTransactions(txList);
      showSnackbar("Ledger synced with latest sales & deliveries.", "success");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sales, deliveries, tires, transactions, accounts]);

  const handleOpenDialog = (account = null) => {
    setSelectedAccount(account);
    if (account) {
      setAccountDetails(account);
    } else {
      setAccountDetails({
        name: "",
        receivable: 0,
        payable: 0,
        email: "",
        phone: "",
        address: "",
        taxId: "",
        category: "",
        currency: "TZS",
      });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
  };

  const handleSaveAccount = () => {
    if (!accountDetails.name || !accountDetails.name.trim()) {
      showSnackbar("Account name is required.", "error");
      return;
    }
    const duplicateName = accounts.some(
      (acc) =>
        String(acc.id) !== String(selectedAccount?.id) &&
        String(acc.name || "").trim().toLowerCase() ===
          String(accountDetails.name).trim().toLowerCase()
    );
    if (duplicateName) {
      showSnackbar("An account with this name already exists.", "error");
      return;
    }
    const snapshot = { ...accountDetails, name: String(accountDetails.name).trim() };
    const isEdit = Boolean(selectedAccount);
    setIsSaving(true);
    setTimeout(() => {
      if (isEdit) {
        const updated = { ...snapshot, id: selectedAccount.id };
        setAccounts((prevAccounts) =>
          prevAccounts.map((acc) =>
            String(acc.id) === String(selectedAccount.id) ? updated : acc
          )
        );
        updateRow("accounts", selectedAccount.id, updated);
        showSnackbar("Account updated successfully.", "success");
      } else {
        const created = { ...snapshot, id: newId() };
        setAccounts((prevAccounts) => [...prevAccounts, created]);
        // Persist remotely; reconcile id if the DB assigns a different one.
        insertRow("accounts", created).then((saved) => {
          if (saved && saved.id && String(saved.id) !== String(created.id)) {
            const newIdValue = saved.id;
            setAccounts((prev) =>
              (prev || []).map((a) =>
                String(a?.id) === String(created.id) ? { ...a, id: newIdValue } : a
              )
            );
            setTransactions((prev) =>
              (prev || []).map((t) =>
                String(t?.accountId) === String(created.id)
                  ? { ...t, accountId: newIdValue }
                  : t
              )
            );
            setInvoices((prev) =>
              (prev || []).map((inv) =>
                String(inv?.customerId) === String(created.id)
                  ? { ...inv, customerId: newIdValue }
                  : inv
              )
            );
          }
        });
        showSnackbar("New account added successfully.", "success");
      }
      setIsSaving(false);
      setOpenDialog(false);
      setSuccessModal({
        open: true,
        title: "Account Saved",
        message: isEdit
          ? "Account updated successfully."
          : "New account added successfully.",
        details: [
          { label: "Name", value: snapshot.name || "-" },
          {
            label: "Receivable",
            value: formatMoney(snapshot.receivable, snapshot.currency),
          },
          { label: "Currency", value: snapshot.currency || "-" },
        ],
      });
    }, 500);
  };

  const handleDeleteAccount = (id) => {
    setConfirmDelete({ open: true, kind: "account", id });
  };

  const doConfirmDelete = () => {
    const { kind, id } = confirmDelete;
    if (kind === "account") {
      setAccounts((prevAccounts) =>
        (prevAccounts || []).filter((acc) => String(acc?.id) !== String(id))
      );
      // Drop its ledger lines locally; remote rows cascade via FK.
      setTransactions((prev) =>
        (prev || []).filter((t) => String(t?.accountId) !== String(id))
      );
      // Keep invoices for the books, but unlink the deleted customer.
      setInvoices((prev) =>
        (prev || []).map((inv) =>
          String(inv?.customerId) === String(id)
            ? { ...inv, customerId: "", customerName: `${inv.customerName || "Unknown Customer"} (deleted)` }
            : inv
        )
      );
      deleteRow("accounts", id);
      handleCloseMenu();
      showSnackbar("Account deleted successfully.", "success");
    } else if (kind === "invoice") {
      const invoiceToDelete = invoices.find((inv) => String(inv?.id) === String(id));
      if (invoiceToDelete && invoiceToDelete.customerId) {
        const reverseAmount = Number(invoiceToDelete.total || 0);
        setAccounts((prevAccounts) =>
          (prevAccounts || []).map((acc) => {
            if (String(acc?.id) === String(invoiceToDelete.customerId)) {
              const next = {
                ...acc,
                receivable: Number(acc.receivable || 0) - reverseAmount,
              };
              updateRow("accounts", acc.id, { receivable: next.receivable });
              return next;
            }
            return acc;
          })
        );
      }
      setInvoices((prevInvoices) =>
        (prevInvoices || []).filter((invoice) => String(invoice?.id) !== String(id))
      );
      deleteRow("invoices", id);
      showSnackbar("Invoice deleted successfully.", "success");
    }
    setConfirmDelete({ open: false, kind: null, id: null });
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setAccountDetails((prevDetails) => ({
      ...prevDetails,
      [name]:
        name === "receivable" || name === "payable"
          ? parseFloat(value) || 0
          : value,
    }));
  };

  const handleSort = (column) => {
    setSortBy(column);
    setSortDirection((prevDirection) =>
      prevDirection === "asc" ? "desc" : "asc"
    );
  };

  const handleOpenMenu = (event, accountId) => {
    setAnchorEl(event.currentTarget);
    setSelectedAccountId(accountId);
  };

  const handleCloseMenu = () => {
    setAnchorEl(null);
    setSelectedAccountId(null);
  };

  const handleOpenTransactionDialog = () => {
    setOpenTransactionDialog(true);
    handleCloseMenu();
  };

  const handleCloseTransactionDialog = () => {
    setOpenTransactionDialog(false);
  };

  const handleTransactionChange = (event) => {
    const { name, value } = event.target;
    setTransactionDetails((prevDetails) => ({
      ...prevDetails,
      [name]: name === "amount" ? parseFloat(value) || 0 : value,
    }));
  };

  const handleSaveTransaction = () => {
    const amount = Number(transactionDetails.amount || 0);
    if (!(amount > 0)) {
      showSnackbar("Amount must be greater than 0.", "error");
      return;
    }
    const targetId = selectedAccountId;
    const target = accounts.find((a) => String(a?.id) === String(targetId));
    if (!target) {
      showSnackbar("Select an account first.", "error");
      return;
    }
    const snapshot = { ...transactionDetails, amount };
    const typeKey = snapshot.type === "payable" ? "payable" : "receivable";
    const record = {
      id: newId(),
      accountId: target.id,
      type: typeKey,
      amount,
      description: snapshot.description || "",
      date: snapshot.date || new Date().toISOString().slice(0, 10),
      currency: snapshot.currency || target.currency || getCurrency(),
    };
    setIsSaving(true);
    setTimeout(() => {
      setTransactions((prev) => [...(prev || []), record]);
      setAccounts((prevAccounts) =>
        (prevAccounts || []).map((acc) => {
          if (String(acc?.id) === String(target.id)) {
            const next = {
              ...acc,
              [typeKey]: Number(acc[typeKey] || 0) + amount,
            };
            if (isUuid(acc.id)) updateRow("accounts", acc.id, { [typeKey]: next[typeKey] });
            return next;
          }
          return acc;
        })
      );
      // Remote ledger row (skipped for legacy non-uuid accounts — local only).
      if (isUuid(target.id)) insertRow("transactions", record);
      setIsSaving(false);
      setOpenTransactionDialog(false);
      showSnackbar("Transaction saved successfully.", "success");
      setSuccessModal({
        open: true,
        title: "Transaction Saved",
        message: "Transaction saved successfully.",
        details: [
          { label: "Account", value: target.name || "-" },
          { label: "Type", value: typeKey === "payable" ? "Payable" : "Receivable" },
          { label: "Amount", value: formatMoney(amount, record.currency) },
          { label: "Date", value: record.date || "-" },
        ],
      });
    }, 500);
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleTabChange = (event, newValue) => {
    setCurrentTab(newValue);
  };

  const handleDateRangeChange = (event) => {
    const { name, value } = event.target;
    setDateRange((prev) => ({ ...prev, [name]: value }));
  };

  const handleEditInvoice = (invoiceId) => {
    const invoice = invoices.find((inv) => inv.id === invoiceId);
    if (!invoice) {
      return;
    }
    setEditingInvoiceId(invoiceId);
    setInvoiceDetails({
      number: invoice.number || "",
      date: invoice.date || new Date().toISOString().split("T")[0],
      dueDate: invoice.dueDate || "",
      items: invoice.items || [],
      total: Number(invoice.total || 0) - Number(invoice.tax || 0),
      tax: Number(invoice.tax || 0),
      currency: invoice.currency || "TZS",
      customerId: invoice.customerId || "",
    });
    setOpenInvoiceDialog(true);
  };

  const handleDeleteInvoice = (invoiceId) => {
    setConfirmDelete({ open: true, kind: "invoice", id: invoiceId });
  };

  const handleTogglePaymentStatus = (invoiceId) => {
    const invoice = invoices.find((inv) => String(inv?.id) === String(invoiceId));
    if (!invoice) return;
    const newStatus = invoice.status === "Paid" ? "Unpaid" : "Paid";
    const total = Number(invoice.total || 0);
    // Real booking: collecting payment settles the receivable; reopening an
    // invoice reinstates it. Status and balance always move together.
    const delta = newStatus === "Paid" ? -total : total;
    const updatedInvoice = { ...invoice, status: newStatus };
    setInvoices((prevInvoices) =>
      (prevInvoices || []).map((inv) =>
        String(inv?.id) === String(invoiceId) ? updatedInvoice : inv
      )
    );
    updateRow("invoices", invoiceId, { status: newStatus });
    if (invoice.customerId) {
      setAccounts((prevAccounts) =>
        (prevAccounts || []).map((acc) => {
          if (String(acc?.id) === String(invoice.customerId)) {
            const next = {
              ...acc,
              receivable: Number(acc.receivable || 0) + delta,
            };
            updateRow("accounts", acc.id, { receivable: next.receivable });
            return next;
          }
          return acc;
        })
      );
    }
    showSnackbar(
      newStatus === "Paid"
        ? "Payment recorded — receivable settled."
        : "Invoice reopened — receivable reinstated.",
      "success"
    );
  };

  const showSnackbar = (message, severity) => {
    setSnackbar({ open: true, message, severity });
  };

  const handleCloseSnackbar = (event, reason) => {
    if (reason === "clickaway") {
      return;
    }
    setSnackbar({ ...snackbar, open: false });
  };

  const filteredAccounts = useMemo(() => {
    const q = (filter || "").toLowerCase();
    return accounts
      .filter(
        (account) =>
          (account.name || "").toLowerCase().includes(q) ||
          (account.email || "").toLowerCase().includes(q) ||
          (account.phone || "").includes(filter || "")
      )
      .sort((a, b) => {
        if (sortDirection === "asc") {
          return a[sortBy] > b[sortBy] ? 1 : -1;
        } else {
          return a[sortBy] < b[sortBy] ? 1 : -1;
        }
      });
  }, [accounts, filter, sortBy, sortDirection]);

  const paginatedAccounts = filteredAccounts.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  const totalReceivables = accounts.reduce(
    (sum, account) => sum + Number(account.receivable || 0),
    0
  );

  const totalPayables = accounts.reduce(
    (sum, account) => sum + Number(account.payable || 0),
    0
  );
  const netBalance = totalReceivables - totalPayables;

  const pieChartData = [
    { name: "Receivables", value: totalReceivables },
    { name: "Payables", value: totalPayables },
  ];

  const barChartData = accounts.map((account) => ({
    name: account.name || "",
    Receivable: Number(account.receivable || 0),
    Payable: Number(account.payable || 0),
  }));

  const lineChartData = (transactions || [])
    .map((transaction) => {
      const owner = (accounts || []).find(
        (a) => String(a?.id) === String(transaction?.accountId)
      );
      return {
        date: transaction.date
          ? new Date(transaction.date).toLocaleDateString()
          : "",
        rawDate: transaction.date ? new Date(transaction.date) : null,
        amount:
          transaction.type === "receivable"
            ? Number(transaction.amount || 0)
            : -Number(transaction.amount || 0),
        accountName: owner?.name || "",
      };
    })
    .filter((entry) => {
      if (dateRange.start) {
        const start = new Date(dateRange.start);
        if (entry.rawDate && entry.rawDate < start) {
          return false;
        }
      }
      if (dateRange.end) {
        const end = new Date(dateRange.end);
        if (entry.rawDate && entry.rawDate > end) {
          return false;
        }
      }
      return true;
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const generatePDF = () => {
    const doc = new jsPDF();
    const startY = paintHeader(doc, { title: "Statement" });
    let y = sectionCaption(doc, "Current account report", startY);
    const tableRows = (accounts || []).map((account) => [
      String(account.name || "—").slice(0, 36),
      money(account.receivable, account.currency),
      money(account.payable, account.currency),
      money(
        Number(account.receivable || 0) - Number(account.payable || 0),
        account.currency
      ),
      account.currency || "",
    ]);
    y = moneyTable(doc, {
      startY: y + 2,
      head: [["Account Name", "Receivable", "Payable", "Balance", "Currency"]],
      body: tableRows.length > 0 ? tableRows : [["—", "", "", "", ""]],
      foot: [
        [
          `Totals (${(accounts || []).length} accounts)`,
          money(totalReceivables, getCurrency()),
          money(totalPayables, getCurrency()),
          money(netBalance, getCurrency()),
          "",
        ],
      ],
      moneyCols: [1, 2, 3],
    });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...DOC_BRAND.muted);
    doc.text(
      "Receivable = owed by customers · Payable = owed to suppliers · Balance = net position.",
      14,
      y + 8,
      { maxWidth: 180 }
    );
    paintFooter(doc, "Current account report");
    doc.save(datedName("current_account_report", "pdf"));
  };

  const exportToCSV = () => {
    downloadCsv(
      datedName("current_account_report", "csv"),
      ["Account Name", "Receivable", "Payable", "Balance", "Currency"],
      (accounts || []).map((account) => [
        account.name || "",
        Number(account.receivable || 0),
        Number(account.payable || 0),
        Number(account.receivable || 0) - Number(account.payable || 0),
        account.currency || "",
      ])
    );
  };

  const handleOpenInvoiceDialog = () => {
    setEditingInvoiceId(null);
    setInvoiceDetails({
      number: "",
      date: new Date().toISOString().split("T")[0],
      dueDate: "",
      items: [],
      total: 0,
      tax: 0,
      currency: "TZS",
      customerId: selectedAccountId || "",
    });
    setOpenInvoiceDialog(true);
  };

  const handleCloseInvoiceDialog = () => {
    setOpenInvoiceDialog(false);
    setEditingInvoiceId(null);
  };

  const handleInvoiceChange = (event) => {
    const { name, value } = event.target;
    setInvoiceDetails((prevDetails) => ({
      ...prevDetails,
      [name]: value,
    }));
  };

  const handleAddInvoiceItem = () => {
    setInvoiceDetails((prevDetails) => ({
      ...prevDetails,
      items: [
        ...(prevDetails.items || []),
        { description: "", quantity: 1, price: 0 },
      ],
    }));
  };

  const handleInvoiceItemChange = (index, field, value) => {
    setInvoiceDetails((prevDetails) => {
      const newItems = [...(prevDetails.items || [])];
      newItems[index][field] =
        field === "quantity" || field === "price"
          ? parseFloat(value) || 0
          : value;
      const total = newItems.reduce(
        (sum, item) =>
          sum + Number(item.quantity || 0) * Number(item.price || 0),
        0
      );
      const tax = total * (getVatRate() / 100);
      return { ...prevDetails, items: newItems, total, tax };
    });
  };

  const handleSaveInvoice = () => {
    if (!invoiceDetails.number || !invoiceDetails.number.trim()) {
      showSnackbar("Invoice number is required.", "error");
      return;
    }
    const duplicate = invoices.some(
      (inv) =>
        inv.number === invoiceDetails.number &&
        String(inv?.id) !== String(editingInvoiceId)
    );
    if (duplicate) {
      showSnackbar("Invoice number must be unique.", "error");
      return;
    }
    const snapshot = {
      ...invoiceDetails,
      items: [...(invoiceDetails.items || [])],
    };
    const snapshotEditingId = editingInvoiceId;
    const customerId = snapshot.customerId || selectedAccountId;
    const customer = accounts.find(
      (acc) => String(acc?.id) === String(customerId)
    );
    const customerName = customer ? customer.name || "" : "Unknown Customer";
    const grandTotal =
      Number(snapshot.total || 0) + Number(snapshot.tax || 0);
    const isEdit = Boolean(snapshotEditingId);
    setIsSaving(true);
    setTimeout(() => {
      if (isEdit) {
        const oldInvoice = invoices.find((inv) => String(inv?.id) === String(snapshotEditingId));
        const oldTotal = Number(oldInvoice ? oldInvoice.total || 0 : 0);
        const oldCustomerId = oldInvoice ? oldInvoice.customerId : null;
        const updatedInvoice = {
          ...oldInvoice,
          number: snapshot.number,
          date: snapshot.date,
          dueDate: snapshot.dueDate,
          customerName,
          customerId,
          total: grandTotal,
          tax: Number(snapshot.tax || 0),
          currency: snapshot.currency,
          items: snapshot.items || [],
        };
        setInvoices((prevInvoices) =>
          (prevInvoices || []).map((inv) =>
            String(inv?.id) === String(snapshotEditingId) ? updatedInvoice : inv
          )
        );
        updateRow("invoices", snapshotEditingId, updatedInvoice);
        setAccounts((prevAccounts) =>
          (prevAccounts || [])
            .map((acc) => {
              if (oldCustomerId && String(acc?.id) === String(oldCustomerId)) {
                const next = {
                  ...acc,
                  receivable: Number(acc.receivable || 0) - oldTotal,
                };
                updateRow("accounts", acc.id, { receivable: next.receivable });
                return next;
              }
              return acc;
            })
            .map((acc) => {
              if (customerId && String(acc?.id) === String(customerId)) {
                const next = {
                  ...acc,
                  receivable: Number(acc.receivable || 0) + grandTotal,
                };
                updateRow("accounts", acc.id, { receivable: next.receivable });
                return next;
              }
              return acc;
            })
        );
        showSnackbar("Invoice updated successfully.", "success");
      } else {
        const newInvoice = {
          id: newId(),
          number: snapshot.number,
          date: snapshot.date,
          dueDate: snapshot.dueDate,
          customerName,
          customerId,
          total: grandTotal,
          tax: Number(snapshot.tax || 0),
          currency: snapshot.currency,
          status: "Unpaid",
          items: snapshot.items || [],
        };

        setInvoices((prevInvoices) => [...(prevInvoices || []), newInvoice]);
        insertRow("invoices", newInvoice).then((saved) => {
          if (saved && saved.id && String(saved.id) !== String(newInvoice.id)) {
            setInvoices((prev) =>
              (prev || []).map((inv) =>
                String(inv?.id) === String(newInvoice.id)
                  ? { ...inv, id: saved.id }
                  : inv
              )
            );
          }
        });

        if (customerId) {
          setAccounts((prevAccounts) =>
            (prevAccounts || []).map((acc) => {
              if (String(acc?.id) === String(customerId)) {
                const next = {
                  ...acc,
                  receivable:
                    Number(acc.receivable || 0) + Number(newInvoice.total || 0),
                };
                updateRow("accounts", acc.id, { receivable: next.receivable });
                return next;
              }
              return acc;
            })
          );
        }
        showSnackbar("Invoice saved successfully.", "success");
      }

      setIsSaving(false);
      setOpenInvoiceDialog(false);
      setEditingInvoiceId(null);
      setInvoiceDetails({
        number: "",
        date: new Date().toISOString().split("T")[0],
        dueDate: "",
        items: [],
        total: 0,
        tax: 0,
        currency: "TZS",
        customerId: "",
      });
      setSuccessModal({
        open: true,
        title: "Invoice Saved",
        message: isEdit
          ? "Invoice updated successfully."
          : "Invoice saved successfully.",
        details: [
          { label: "Number", value: snapshot.number || "-" },
          { label: "Customer", value: customerName || "-" },
          {
            label: "Total",
            value: formatMoney(grandTotal, snapshot.currency),
          },
        ],
      });
    }, 500);
  };

  const calculateBalance = (account) => {
    return Number(account.receivable || 0) - Number(account.payable || 0);
  };

  return (
    <Box sx={{ display: "flex" }}>
      <Drawer
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: drawerWidth,
            boxSizing: "border-box",
          },
        }}
        variant="persistent"
        anchor="left"
        open={openDrawer}
      >
        <Divider />
        <List>
          <ListItem button onClick={() => setCurrentTab(0)}>
            <ListItemIcon>
              <DashboardIcon />
            </ListItemIcon>
            <ListItemText primary="Overview" />
          </ListItem>
          <ListItem button onClick={() => setCurrentTab(1)}>
            <ListItemIcon>
              <PeopleIcon />
            </ListItemIcon>
            <ListItemText primary="Accounts" />
          </ListItem>
          <ListItem button onClick={() => setCurrentTab(2)}>
            <ListItemIcon>
              <ReceiptIcon />
            </ListItemIcon>
            <ListItemText primary="Invoices" />
          </ListItem>
          <ListItem button onClick={() => setCurrentTab(3)}>
            <ListItemIcon>
              <LocalAtmIcon />
            </ListItemIcon>
            <ListItemText primary="Cash Flow" />
          </ListItem>
          <ListItem button onClick={() => setCurrentTab(4)}>
            <ListItemIcon>
              <TrendingUpIcon />
            </ListItemIcon>
            <ListItemText primary="Profit/Loss" />
          </ListItem>
          <ListItem button onClick={() => setCurrentTab(5)}>
            <ListItemIcon>
              <AccountBalanceWalletIcon />
            </ListItemIcon>
            <ListItemText primary="Tax Management" />
          </ListItem>
        </List>
        <Divider />
        <List>
          <ListItem button>
            <ListItemIcon>
              <SettingsIcon />
            </ListItemIcon>
            <ListItemText primary="Settings" />
          </ListItem>
          <ListItem button>
            <ListItemIcon>
              <ExitToAppIcon />
            </ListItemIcon>
            <ListItemText primary="Logout" />
          </ListItem>
        </List>
      </Drawer>
      <Main open={openDrawer}>
        <Box sx={{ mb: 2 }}>
          <Button
            variant="outlined"
            onClick={() => setOpenDrawer((prev) => !prev)}
          >
            {openDrawer ? "Close Menu" : "Open Menu"}
          </Button>
        </Box>
        <Tabs
          value={currentTab}
          onChange={handleTabChange}
          aria-label="dashboard tabs"
        >
          <Tab label="Overview" />
          <Tab label="Accounts" />
          <Tab label="Invoices" />
          <Tab label="Cash Flow" />
          <Tab label="Profit/Loss" />
          <Tab label="Tax Management" />
        </Tabs>
        {currentTab === 0 && (
          <>
            <Grid container spacing={3} sx={{ mt: 2 }}>
              <Grid item xs={12} md={3}>
                <MetricCard elevation={3}>
                  <Typography variant="h6" gutterBottom>
                    Total Receivables
                  </Typography>
                  <Typography variant="h4" color="primary">
                    {formatMoney(totalReceivables, getCurrency())}
                  </Typography>
                </MetricCard>
              </Grid>
              <Grid item xs={12} md={3}>
                <MetricCard elevation={3}>
                  <Typography variant="h6" gutterBottom>
                    Total Payables
                  </Typography>
                  <Typography variant="h4" color="error">
                    {formatMoney(totalPayables, getCurrency())}
                  </Typography>
                </MetricCard>
              </Grid>
              <Grid item xs={12} md={3}>
                <MetricCard elevation={3}>
                  <Typography variant="h6" gutterBottom>
                    Net Balance
                  </Typography>
                  <Typography
                    variant="h4"
                    color={netBalance >= 0 ? "success" : "error"}
                  >
                    {formatMoney(netBalance, getCurrency())}
                  </Typography>
                </MetricCard>
              </Grid>
              <Grid item xs={12} md={3}>
                <MetricCard elevation={3}>
                  <Typography variant="h6" gutterBottom>
                    Total Accounts
                  </Typography>
                  <Typography variant="h4">{accounts.length}</Typography>
                </MetricCard>
              </Grid>
            </Grid>

            <Grid container spacing={3} sx={{ mt: 2 }}>
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 2 }}>
                  <Typography variant="h6" gutterBottom>
                    Receivable/Payable Distribution
                  </Typography>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={pieChartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, percent }) =>
                          `${name || ""} ${(Number(percent || 0) * 100).toFixed(0)}%`
                        }
                      >
                        {pieChartData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={COLORS[index % COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <RechartsTooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </Paper>
              </Grid>
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 2 }}>
                  <Typography variant="h6" gutterBottom>
                    Account-Based Receivable/Payable Status
                  </Typography>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={barChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <RechartsTooltip />
                      <Legend />
                      <Bar dataKey="Receivable" fill="#8884d8" />
                      <Bar dataKey="Payable" fill="#82ca9d" />
                    </BarChart>
                  </ResponsiveContainer>
                </Paper>
              </Grid>
            </Grid>
          </>
        )}

        {currentTab === 1 && (
          <Paper sx={{ width: "100%", mb: 2, mt: 2, p: 2 }}>
            <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap" }}>
              <TextField
                label="Search Accounts"
                variant="outlined"
                size="small"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <Button
                variant="outlined"
                startIcon={<PictureAsPdfIcon />}
                onClick={generatePDF}
              >
                Download PDF
              </Button>
              <Button variant="outlined" onClick={exportToCSV}>
                Download CSV
              </Button>
            </Box>
            <TableContainer sx={{ overflowX: "auto" }}>
              <Table stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>
                      <TableSortLabel
                        active={sortBy === "name"}
                        direction={sortBy === "name" ? sortDirection : "asc"}
                        onClick={() => handleSort("name")}
                      >
                        Account Name
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>
                      <TableSortLabel
                        active={sortBy === "receivable"}
                        direction={
                          sortBy === "receivable" ? sortDirection : "asc"
                        }
                        onClick={() => handleSort("receivable")}
                      >
                        Receivable
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>
                      <TableSortLabel
                        active={sortBy === "payable"}
                        direction={sortBy === "payable" ? sortDirection : "asc"}
                        onClick={() => handleSort("payable")}
                      >
                        Payable
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>Balance</TableCell>
                    <TableCell>Currency</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedAccounts.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell>{account.name || ""}</TableCell>
                      <TableCell>
                        {formatMoney(account.receivable || 0, account.currency)}
                      </TableCell>
                      <TableCell>
                        {formatMoney(account.payable || 0, account.currency)}
                      </TableCell>
                      <TableCell>
                        {formatMoney(calculateBalance(account) || 0, account.currency)}
                      </TableCell>
                      <TableCell>{account.currency}</TableCell>
                      <TableCell>
                        <IconButton
                          size="small"
                          onClick={(event) => handleOpenMenu(event, account.id)}
                        >
                          <MoreVertIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              rowsPerPageOptions={[5, 10, 25]}
              component="div"
              count={filteredAccounts.length}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
            />
          </Paper>
        )}

        {currentTab === 2 && (
          <Paper sx={{ p: 2, mt: 2 }}>
            <Typography variant="h6" gutterBottom>
              Invoices
            </Typography>
            <Button
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
              onClick={handleOpenInvoiceDialog}
              sx={{ mb: 2 }}
            >
              Create New Invoice
            </Button>
            <TableContainer sx={{ overflowX: "auto" }}>
              <Table stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Invoice No</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell>Customer</TableCell>
                    <TableCell>Amount</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(invoices || []).map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell>{invoice.number || ""}</TableCell>
                      <TableCell>
                        {invoice.date
                          ? new Date(invoice.date).toLocaleDateString()
                          : ""}
                      </TableCell>
                      <TableCell>{invoice.customerName || ""}</TableCell>
                      <TableCell>
                        {Number(invoice.total || 0).toFixed(2)}{" "}
                        {invoice.currency || ""}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={invoice.status}
                          color={
                            invoice.status === "Paid" ? "success" : "warning"
                          }
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <IconButton
                          onClick={() => handleDownloadInvoice(invoice)}
                        >
                          <PictureAsPdfIcon />
                        </IconButton>
                        <IconButton
                          onClick={() => handleEditInvoice(invoice.id)}
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          onClick={() => handleDeleteInvoice(invoice.id)}
                        >
                          <DeleteIcon />
                        </IconButton>
                        <IconButton
                          onClick={() => handleTogglePaymentStatus(invoice.id)}
                        >
                          {invoice.status === "Paid" ? (
                            <MoneyOffIcon />
                          ) : (
                            <AttachMoneyIcon />
                          )}
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}

        {currentTab === 3 && (
          <Paper sx={{ p: 2, mt: 2 }}>
            <Typography variant="h6" gutterBottom>
              Cash Flow
            </Typography>
            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Start Date"
                  type="date"
                  name="start"
                  value={dateRange.start}
                  onChange={handleDateRangeChange}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="End Date"
                  type="date"
                  name="end"
                  value={dateRange.end}
                  onChange={handleDateRangeChange}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
              </Grid>
            </Grid>
            <ResponsiveContainer width="100%" height={400}>
              <AreaChart data={lineChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <RechartsTooltip />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="#8884d8"
                  fill="#8884d8"
                />
              </AreaChart>
            </ResponsiveContainer>
            <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
              Ledger — all posted entries
            </Typography>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel id="ledger-account-label">Account</InputLabel>
              <Select
                labelId="ledger-account-label"
                value={ledgerAccountId}
                label="Account"
                onChange={(e) => setLedgerAccountId(e.target.value)}
              >
                <MenuItem value="all">All accounts</MenuItem>
                {(accounts || []).map((acc) => (
                  <MenuItem key={String(acc?.id)} value={String(acc?.id)}>
                    {acc?.name || "Unnamed"}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TableContainer sx={{ overflowX: "auto" }}>
              <Table stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Account</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Description</TableCell>
                    <TableCell align="right">Amount</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {ledgerRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center">
                        No ledger entries yet — record a sale, delivery, invoice
                        or manual transaction.
                      </TableCell>
                    </TableRow>
                  ) : (
                    ledgerRows.map((t) => {
                      const owner = (accounts || []).find(
                        (a) => String(a?.id) === String(t?.accountId)
                      );
                      const auto = /\[(sale|delivery):/.test(String(t?.description || ""));
                      return (
                        <TableRow key={String(t?.id)}>
                          <TableCell>{t?.date || ""}</TableCell>
                          <TableCell>{owner?.name || "—"}</TableCell>
                          <TableCell>
                            <Chip
                              label={t?.type === "payable" ? "Payable" : "Receivable"}
                              size="small"
                              color={t?.type === "payable" ? "error" : "success"}
                              variant="outlined"
                            />
                            {auto && (
                              <Tooltip title="Auto-posted — void by deleting the source sale or delivery">
                                <Chip size="small" label="auto" variant="outlined" sx={{ ml: 0.5 }} />
                              </Tooltip>
                            )}
                          </TableCell>
                          <TableCell>{t?.description || ""}</TableCell>
                          <TableCell align="right">
                            {formatMoney(t?.amount, t?.currency || owner?.currency)}
                          </TableCell>
                          <TableCell align="right">
                            {isLedgerAdmin && !auto && (
                              <Tooltip title="Void entry (reverses balance)">
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => handleVoidTransaction(t)}
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}

        {currentTab === 4 && (
          <Paper sx={{ p: 2, mt: 2 }}>
            <Typography variant="h6" gutterBottom>
              Profit/Loss Statement
            </Typography>
            <TableContainer sx={{ overflowX: "auto" }}>
              <Table stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Category</TableCell>
                    <TableCell align="right">Amount</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow>
                    <TableCell>Total Income</TableCell>
                    <TableCell align="right">
                      {formatMoney(totalReceivables, getCurrency())}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Total Expenses</TableCell>
                    <TableCell align="right">
                      {formatMoney(totalPayables, getCurrency())}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>
                      <strong>Net Profit/Loss</strong>
                    </TableCell>
                    <TableCell align="right">
                      <strong>{formatMoney(netBalance, getCurrency())}</strong>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}

        {currentTab === 5 && (
          <Paper sx={{ p: 2, mt: 2 }}>
            <Typography variant="h6" gutterBottom>
              Tax Management
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Accordion>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography>VAT Calculation</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Typography>
                      Total VAT: {formatMoney(totalReceivables * (getVatRate() / 100) || 0, getCurrency())}
                    </Typography>
                  </AccordionDetails>
                </Accordion>
              </Grid>
              <Grid item xs={12} md={6}>
                <Accordion>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography>Income Tax Estimate</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Typography>
                      Estimated Income Tax: {formatMoney(netBalance * 0.15 || 0, getCurrency())}
                    </Typography>
                  </AccordionDetails>
                </Accordion>
              </Grid>
            </Grid>
          </Paper>
        )}

        <Fab
          color="primary"
          aria-label="add"
          sx={{ position: "fixed", bottom: 16, right: 16 }}
          onClick={() => handleOpenDialog()}
        >
          <AddIcon />
        </Fab>
      </Main>

      <Dialog
        open={openDialog}
        TransitionComponent={Transition}
        keepMounted
        onClose={handleCloseDialog}
      >
        <DialogTitle>
          {selectedAccount ? "Edit Account" : "Add New Account"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>Enter account information.</DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            id="name"
            name="name"
            label="Account Name"
            type="text"
            fullWidth
            variant="standard"
            value={accountDetails.name}
            onChange={handleChange}
          />
          <TextField
            margin="dense"
            id="receivable"
            name="receivable"
            label="Receivable"
            type="number"
            fullWidth
            variant="standard"
            value={accountDetails.receivable}
            onChange={handleChange}
          />
          <TextField
            margin="dense"
            id="payable"
            name="payable"
            label="Payable"
            type="number"
            fullWidth
            variant="standard"
            value={accountDetails.payable}
            onChange={handleChange}
          />
          <TextField
            margin="dense"
            id="email"
            name="email"
            label="Email"
            type="email"
            fullWidth
            variant="standard"
            value={accountDetails.email}
            onChange={handleChange}
          />
          <TextField
            margin="dense"
            id="phone"
            name="phone"
            label="Phone"
            type="text"
            fullWidth
            variant="standard"
            value={accountDetails.phone}
            onChange={handleChange}
          />
          <TextField
            margin="dense"
            id="address"
            name="address"
            label="Address"
            type="text"
            fullWidth
            variant="standard"
            value={accountDetails.address}
            onChange={handleChange}
          />
          <TextField
            margin="dense"
            id="taxId"
            name="taxId"
            label="Tax ID Number"
            type="text"
            fullWidth
            variant="standard"
            value={accountDetails.taxId}
            onChange={handleChange}
          />
          <TextField
            margin="dense"
            id="category"
            name="category"
            label="Category"
            type="text"
            fullWidth
            variant="standard"
            value={accountDetails.category}
            onChange={handleChange}
          />
          <FormControl fullWidth margin="dense">
            <InputLabel id="currency-label">Currency</InputLabel>
            <Select
              labelId="currency-label"
              id="currency"
              name="currency"
              value={accountDetails.currency}
              onChange={handleChange}
            >
              {currencies.map((currency) => (
                <MenuItem key={currency} value={currency}>
                  {currency}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} disabled={isSaving}>Cancel</Button>
          <Button onClick={handleSaveAccount} disabled={isSaving} startIcon={isSaving ? <CircularProgress size={20} /> : null}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleCloseMenu}
      >
        <MenuItem onClick={handleOpenTransactionDialog}>
          <ListItemIcon>
            <AddIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="New Transaction" />
        </MenuItem>
        <MenuItem
          onClick={() => {
            handleOpenInvoiceDialog();
            handleCloseMenu();
          }}
        >
          <ListItemIcon>
            <ReceiptIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Create Invoice" />
        </MenuItem>
        <MenuItem onClick={() => handleDeleteAccount(selectedAccountId)}>
          <ListItemIcon>
            <DeleteIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Delete Account" />
        </MenuItem>
      </Menu>

      <Dialog
        open={openTransactionDialog}
        TransitionComponent={Transition}
        keepMounted
        onClose={handleCloseTransactionDialog}
      >
        <DialogTitle>Add New Transaction</DialogTitle>
        <DialogContent>
          <TextField
            margin="dense"
            id="type"
            name="type"
            label="Transaction Type"
            select
            fullWidth
            variant="standard"
            value={transactionDetails.type}
            onChange={handleTransactionChange}
          >
            <MenuItem value="receivable">Receivable</MenuItem>
            <MenuItem value="payable">Payable</MenuItem>
          </TextField>
          <TextField
            margin="dense"
            id="amount"
            name="amount"
            label="Amount"
            type="number"
            fullWidth
            variant="standard"
            value={transactionDetails.amount}
            onChange={handleTransactionChange}
          />
          <TextField
            margin="dense"
            id="description"
            name="description"
            label="Description"
            type="text"
            fullWidth
            variant="standard"
            value={transactionDetails.description}
            onChange={handleTransactionChange}
          />
          <TextField
            margin="dense"
            id="date"
            name="date"
            label="Date"
            type="date"
            fullWidth
            variant="standard"
            InputLabelProps={{ shrink: true }}
            value={transactionDetails.date}
            onChange={handleTransactionChange}
          />
          <FormControl fullWidth margin="dense">
            <InputLabel id="transaction-currency-label">Currency</InputLabel>
            <Select
              labelId="transaction-currency-label"
              id="currency"
              name="currency"
              value={transactionDetails.currency}
              onChange={handleTransactionChange}
            >
              {currencies.map((currency) => (
                <MenuItem key={currency} value={currency}>
                  {currency}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseTransactionDialog} disabled={isSaving}>Cancel</Button>
          <Button onClick={handleSaveTransaction} disabled={isSaving} startIcon={isSaving ? <CircularProgress size={20} /> : null}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={openInvoiceDialog}
        TransitionComponent={Transition}
        keepMounted
        onClose={handleCloseInvoiceDialog}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          {editingInvoiceId ? "Edit Invoice" : "Create Invoice"}
        </DialogTitle>
        <DialogContent>
          <FormControl fullWidth margin="dense">
            <InputLabel id="invoice-customer-label">Customer</InputLabel>
            <Select
              labelId="invoice-customer-label"
              id="customerId"
              name="customerId"
              value={invoiceDetails.customerId || ""}
              onChange={handleInvoiceChange}
            >
              {accounts.map((account) => (
                <MenuItem key={account.id} value={account.id}>
                  {account.name || ""}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            margin="dense"
            id="number"
            name="number"
            label="Invoice Number"
            type="text"
            fullWidth
            variant="standard"
            value={invoiceDetails.number}
            onChange={handleInvoiceChange}
          />
          <TextField
            margin="dense"
            id="date"
            name="date"
            label="Invoice Date"
            type="date"
            fullWidth
            variant="standard"
            InputLabelProps={{ shrink: true }}
            value={invoiceDetails.date}
            onChange={handleInvoiceChange}
          />
          <TextField
            margin="dense"
            id="dueDate"
            name="dueDate"
            label="Due Date"
            type="date"
            fullWidth
            variant="standard"
            InputLabelProps={{ shrink: true }}
            value={invoiceDetails.dueDate}
            onChange={handleInvoiceChange}
          />
          <Typography variant="h6" sx={{ mt: 2 }}>
            Invoice Items
          </Typography>
          {(invoiceDetails.items || []).map((item, index) => (
            <Box key={index} sx={{ display: "flex", gap: 2, mb: 2 }}>
              <TextField
                label="Description"
                value={item.description || ""}
                onChange={(e) =>
                  handleInvoiceItemChange(index, "description", e.target.value)
                }
                fullWidth
              />
              <TextField
                label="Quantity"
                type="number"
                value={item.quantity ?? 0}
                onChange={(e) =>
                  handleInvoiceItemChange(index, "quantity", e.target.value)
                }
                sx={{ width: "100px" }}
              />
              <TextField
                label="Unit Price"
                type="number"
                value={item.price ?? 0}
                onChange={(e) =>
                  handleInvoiceItemChange(index, "price", e.target.value)
                }
                sx={{ width: "150px" }}
              />
            </Box>
          ))}
          <Button onClick={handleAddInvoiceItem} startIcon={<AddIcon />}>
            Add Item
          </Button>
          <Typography variant="h6" sx={{ mt: 2 }}>
            Summary
          </Typography>
          <Typography>
            Subtotal: {formatMoney(invoiceDetails.total, invoiceDetails.currency)}
          </Typography>
          <Typography>
            VAT ({getVatRate()}%): {formatMoney(invoiceDetails.tax, invoiceDetails.currency)}
          </Typography>
          <Typography variant="h6">
            Grand Total:{" "}
            {formatMoney(
              Number(invoiceDetails.total || 0) +
                Number(invoiceDetails.tax || 0),
              invoiceDetails.currency
            )}
          </Typography>
          <FormControl fullWidth margin="dense">
            <InputLabel id="invoice-currency-label">Currency</InputLabel>
            <Select
              labelId="invoice-currency-label"
              id="currency"
              name="currency"
              value={invoiceDetails.currency}
              onChange={handleInvoiceChange}
            >
              {currencies.map((currency) => (
                <MenuItem key={currency} value={currency}>
                  {currency}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseInvoiceDialog} disabled={isSaving}>Cancel</Button>
          <Button onClick={handleSaveInvoice} disabled={isSaving} startIcon={isSaving ? <CircularProgress size={20} /> : null}>
            {isSaving ? "Saving..." : editingInvoiceId ? "Update Invoice" : "Save Invoice"}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity={snackbar.severity}
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>

      <Dialog
        open={confirmDelete.open}
        onClose={() => setConfirmDelete({ open: false, kind: null, id: null })}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          {confirmDelete.kind === "invoice" ? "Delete invoice?" : "Delete account?"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>This cannot be undone.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete({ open: false, kind: null, id: null })}>
            Cancel
          </Button>
          <Button onClick={doConfirmDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <SuccessModal
        open={successModal.open}
        onClose={() => setSuccessModal((prev) => ({ ...prev, open: false }))}
        title={successModal.title}
        message={successModal.message}
        details={successModal.details}
      />

      {loading && (
        <Box
          sx={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            zIndex: 9999,
          }}
        >
          <CircularProgress />
        </Box>
      )}
    </Box>
  );
};

export default CurrentAccount;
