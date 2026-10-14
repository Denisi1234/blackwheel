import React, { useState, useEffect, useMemo, useRef, Suspense, lazy } from "react";
import { BrowserRouter as Router } from "react-router-dom";
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Box,
  Button,
  Container,
  Typography,
  IconButton,
  AppBar as MuiAppBar,
  Toolbar,
  Divider,
  Paper,
  useMediaQuery,
  Avatar,
  Tooltip,
  Menu,
  MenuItem,
  Fade,
  Badge,
  SwipeableDrawer,
  ListSubheader,
} from "@mui/material";
import { styled } from "@mui/material/styles";
import MenuIcon from "@mui/icons-material/Menu";
import DashboardIcon from "@mui/icons-material/Dashboard";
import AddCircleIcon from "@mui/icons-material/AddCircle";
import SellIcon from "@mui/icons-material/Sell";
import HotelIcon from "@mui/icons-material/Hotel";
import ListAltIcon from "@mui/icons-material/ListAlt";
import Brightness4Icon from "@mui/icons-material/Brightness4";
import Brightness7Icon from "@mui/icons-material/Brightness7";
import SettingsIcon from "@mui/icons-material/Settings";
import ExitToAppIcon from "@mui/icons-material/ExitToApp";
import NotificationsIcon from "@mui/icons-material/Notifications";
import TireRepairIcon from "@mui/icons-material/BuildCircle";
import AnalyticsIcon from "@mui/icons-material/Analytics";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import StoreIcon from "@mui/icons-material/Store";
import DirectionsCarIcon from "@mui/icons-material/DirectionsCar";
import PersonIcon from "@mui/icons-material/Person";
import InventoryIcon from "@mui/icons-material/Inventory";
import GroupIcon from "@mui/icons-material/Group";
import { supabase } from "./lib/supabaseClient";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import { getLowStockThreshold, getCurrency } from "./lib/settings";
import {
  loadTable,
  insertRow,
  syncLocalToCloud,
  updateRow,
  deleteRow,
  deleteRowsByTireId,
  upsertInventoryRow,
  isSupabaseConfigured,
  getCurrentShopId,
  setCurrentShopId,
} from "./lib/store";
import {
  resolveShopMemberships,
  enterShop,
  ensurePersonalShop,
} from "./lib/team";
import Dashboard from "./components/Dashboard";
import ErrorBoundary from "./components/ErrorBoundary";
import { CircularProgress } from "@mui/material";
// Code-split heavy screens so the first paint stays small (prod bundle fix).
// Dashboard stays eager (landing screen); everything else lazy-loads on demand.
const TireForm = lazy(() => import("./components/TireForm"));
const TireList = lazy(() => import("./components/TireList"));
const SaleForm = lazy(() => import("./components/SaleForm"));
const TireHotel = lazy(() => import("./components/TireHotel"));
const CurrentAccount = lazy(() => import("./components/CurrentAccount"));
const Inventory = lazy(() => import("./components/Inventory"));
const Deliveries = lazy(() => import("./components/Deliveries"));
const VehicleTracking = lazy(() => import("./components/VehicleTracking"));
const WorkerTracking = lazy(() => import("./components/WorkerTracking"));
const AppointmentSystem = lazy(() => import("./components/AppointmentSystem"));
const Settings = lazy(() => import("./components/Settings"));
const AuthModal = lazy(() => import("./components/AuthModal"));
const ShopGate = lazy(() => import("./components/ShopGate"));
const TeamManagement = lazy(() => import("./components/TeamManagement"));

const drawerWidth = 240;

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
    [theme.breakpoints.down("sm")]: {
      marginLeft: 0,
      padding: theme.spacing(2),
    },
  })
);

const StyledAppBar = styled(MuiAppBar, {
  shouldForwardProp: (prop) => prop !== "open",
})(({ theme, open }) => ({
  transition: theme.transitions.create(["margin", "width"], {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
  ...(open && {
    width: `calc(100% - ${drawerWidth}px)`,
    marginLeft: `${drawerWidth}px`,
    transition: theme.transitions.create(["margin", "width"], {
      easing: theme.transitions.easing.easeOut,
      duration: theme.transitions.duration.enteringScreen,
    }),
  }),
  [theme.breakpoints.down("sm")]: {
    width: "100%",
    marginLeft: 0,
  },
}));

const DrawerHeader = styled("div")(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  padding: theme.spacing(0, 1),
  ...theme.mixins.toolbar,
  justifyContent: "flex-start",
}));

const Logo = styled("div")(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  padding: theme.spacing(0, 1),
  ...theme.mixins.toolbar,
  justifyContent: "center",
}));

const StyledBadge = styled(Badge)(({ theme }) => ({
  "& .MuiBadge-badge": {
    right: -3,
    top: 13,
    border: `2px solid ${theme.palette.background.paper}`,
    padding: "0 4px",
  },
}));

const App = () => {
  const [tires, setTires] = useState([]);
  const [sales, setSales] = useState([]);
  const [hotelTires, setHotelTires] = useState([]);
  const [selectedComponent, setSelectedComponent] = useState("Dashboard");
  const [open, setOpen] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem("blackwheel_auth_user");
      if (stored) return JSON.parse(stored);
      // One-time migration from the previous brand's session key.
      const legacy = localStorage.getItem("dost_auth_user");
      if (legacy) {
        localStorage.setItem("blackwheel_auth_user", legacy);
        localStorage.removeItem("dost_auth_user");
        return JSON.parse(legacy);
      }
      return null;
    } catch (e) {
      return null;
    }
  });
  const [inventory, setInventory] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [storageWarning, setStorageWarning] = useState("");
  const [pendingUpload, setPendingUpload] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [shop, setShop] = useState(null);
  const loadedRef = useRef(false);

  // ---- Multi-tenant shop session --------------------------------------
  // Single shop => enter silently; none/many => ShopGate picks. Offline =>
  // no shops at all (pure local mode).
  const enterMemberships = (baseUser, memberships) => {
    const list = memberships || [];
    const storedId = getCurrentShopId();
    const match =
      storedId && list.find((m) => String(m.shopId) === String(storedId));
    const chosen = match || (list.length === 1 ? list[0] : null);
    if (chosen) {
      setShop({
        id: chosen.shopId,
        name: chosen.shopName,
        role: chosen.role,
        profileId: chosen.profileId,
      });
      enterShop(chosen);
    } else {
      setShop(null);
      setCurrentShopId("");
    }
    const full = {
      ...baseUser,
      memberships: list,
      role: (chosen && chosen.role) || baseUser.role || "Staff",
    };
    setUser(full);
    try {
      localStorage.setItem("blackwheel_auth_user", JSON.stringify(full));
    } catch (e) {
      // ignore
    }
    return full;
  };

  // One account IS one shop: a shop-less login auto-provisions a personal
  // shop, so registration stays plain name/email/password with no shop
  // typing. Invited users (existing memberships) keep their flow untouched.
  // ShopGate remains only for multi-shop choice and provisioning failures.
  const provisioningRef = useRef({});
  const autoProvisionShop = async (baseUser, memberships) => {
    const list = memberships || [];
    if (list.length > 0) return enterMemberships(baseUser, list);
    const uid = baseUser && baseUser.id;
    if (uid && provisioningRef.current[uid]) {
      // A parallel session restore is already creating the shop — wait for
      // it, then re-resolve instead of creating a second shop.
      try {
        await provisioningRef.current[uid];
      } catch (e) {
        // fall through to re-resolve below
      }
      try {
        const r = await resolveShopMemberships({ id: baseUser.id, email: baseUser.email });
        return enterMemberships(baseUser, (r && r.memberships) || []);
      } catch (e) {
        return enterMemberships(baseUser, []);
      }
    }
    const p = ensurePersonalShop(baseUser, baseUser && baseUser.name);
    if (uid) provisioningRef.current[uid] = p;
    try {
      const membership = await p;
      return enterMemberships(baseUser, [membership]);
    } catch (e) {
      console.warn("Auto shop provisioning failed, showing ShopGate:", (e && e.message) || e);
      return enterMemberships(baseUser, []);
    } finally {
      if (uid) delete provisioningRef.current[uid];
    }
  };

  const resolveAndEnter = async (baseUser) => {
    if (!isSupabaseConfigured() || !baseUser) {
      if (baseUser) setUser(baseUser);
      return baseUser;
    }
    try {
      const resolved = await resolveShopMemberships({
        id: baseUser.id,
        email: baseUser.email,
      });
      if (resolved && resolved.blocked) {
        // Deactivated while away — drop to the login screen.
        try {
          if (supabase && supabase.auth) await supabase.auth.signOut();
        } catch (e) {
          // ignore
        }
        setUser(null);
        setShop(null);
        try {
          localStorage.removeItem("blackwheel_auth_user");
        } catch (e) {
          // ignore
        }
        setCurrentShopId("");
        return null;
      }
      return autoProvisionShop(baseUser, (resolved && resolved.memberships) || []);
    } catch (e) {
      setUser(baseUser);
      return baseUser;
    }
  };

  const handleSignOut = async () => {
    try {
      if (supabase && supabase.auth) {
        await supabase.auth.signOut();
      }
    } catch (e) {
      // ignore
    }
    setUser(null);
    setShop(null);
    try {
      localStorage.removeItem("blackwheel_auth_user");
    } catch (e) {
      // ignore
    }
    setCurrentShopId("");
  };

  // Wire bell icon to actual low-stock count: stock <= lowStockThreshold
  const lowStockCount = useMemo(() => {
    const threshold = getLowStockThreshold();
    return (tires || []).filter((t) => (Number(t?.stock) || 0) <= threshold).length;
  }, [tires]);

  const componentTitles = useMemo(() => ({
    Dashboard: "Dashboard",
    TireForm: "Add New Tire",
    TireList: "Tire List",
    SaleForm: "Sell Tire",
    TireHotel: "Tire Hotel",
    CurrentAccount: "Current Account",
    VehicleTracking: "Vehicle Tracking",
    WorkerTracking: "Worker Tracking",
    AppointmentSystem: "Appointment System",
    Inventory: "Inventory",
    Deliveries: "Deliveries",
    Settings: "Settings",
    TeamManagement: "Team",
  }), []);

  // Sync Supabase Auth session if configured
  useEffect(() => {
    let subscription = null;
    try {
      if (supabase && supabase.auth) {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user) {
            resolveAndEnter({
              id: session.user.id,
              email: session.user.email,
              name: session.user.user_metadata?.full_name || session.user.email.split('@')[0],
              role: session.user.user_metadata?.role || 'Staff',
              avatar: session.user.user_metadata?.avatar_url || '',
            });
          }
        }).catch(() => {
          // ignore
        });

        const { data } = supabase.auth.onAuthStateChange((_event, session) => {
          if (session?.user) {
            resolveAndEnter({
              id: session.user.id,
              email: session.user.email,
              name: session.user.user_metadata?.full_name || session.user.email.split('@')[0],
              role: session.user.user_metadata?.role || 'Staff',
              avatar: session.user.user_metadata?.avatar_url || '',
            });
          } else if (_event === 'SIGNED_OUT') {
            setUser(null);
            setShop(null);
            try {
              localStorage.removeItem("blackwheel_auth_user");
            } catch (e) {
              // ignore
            }
            setCurrentShopId("");
          }
        });
        subscription = data?.subscription;
      }
    } catch (e) {
      // ignore
    }

    return () => {
      if (subscription?.unsubscribe) subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // UUID-first IDs so local rows match Postgres `uuid` PKs.
  // Legacy localStorage rows may still carry numeric Date.now() ids — all
  // lookups below use String() comparison so both shapes keep working.
  const newId = () => {
    try {
      if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
      }
    } catch (e) {
      // fall through to fallback
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  };

  // Canonical cost / retail accessors. Legacy rows only have `price`
  // (purchase cost); new rows carry costPrice + retailPrice explicitly.
  const getCost = (tire) => {
    if (!tire) return 0;
    const raw =
      tire.costPrice !== undefined && tire.costPrice !== "" ? tire.costPrice : tire.price;
    const n = Number(raw);
    return Number.isNaN(n) ? 0 : n;
  };

  const getRetail = (tire) => {
    if (!tire) return NaN;
    // NOTE: no fallback to `price` — `price` is wholesale cost. Falling back
    // here is exactly what made sale forms default to cost and zero out profit.
    const raw = tire.retailPrice;
    if (raw === undefined || raw === null || raw === "") return NaN;
    const n = Number(raw);
    return Number.isFinite(n) ? n : NaN;
  };

  const safeParse = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (e) {
      console.error(`Failed to parse localStorage key "${key}":`, e);
      return fallback;
    }
  };

  const safeSave = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      const isQuota =
        e &&
        (e.name === "QuotaExceededError" ||
          e.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
          e.code === 22);
      console.error(`Failed to save localStorage key "${key}":`, e);
      // Quota fallback for tires: retry without embedded base64 images so the
      // structured data survives even when photos would blow the ~5MB limit.
      // (Photos prefer Supabase Storage URLs; see uploadTirePhoto.)
      if (isQuota && key === "tires" && Array.isArray(value)) {
        try {
          const stripped = value.map((t) => {
            if (t && Array.isArray(t.images) && t.images.some((img) => typeof img === "string" && img.startsWith("data:"))) {
              const kept = (t.images || []).filter(
                (img) => typeof img === "string" && !img.startsWith("data:")
              );
              return { ...t, images: kept };
            }
            return t;
          });
          localStorage.setItem(key, JSON.stringify(stripped));
          setStorageWarning(
            "Browser storage is full — tire photos were dropped to preserve inventory data. Connect Supabase Storage or remove photos."
          );
          return true;
        } catch (e2) {
          console.error("Quota fallback save also failed:", e2);
        }
      }
      setStorageWarning(
        "Browser storage is full — recent changes may not persist after refresh. Export a backup from Settings."
      );
      return false;
    }
  };

  const prefersDarkMode = useMediaQuery("(prefers-color-scheme: dark)");
  const isMobile = useMediaQuery("(max-width:600px)");

  useEffect(() => {
    setDarkMode(prefersDarkMode);
    if (isMobile) setOpen(false);
  }, [prefersDarkMode, isMobile]);

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: darkMode ? "dark" : "light",
          primary: {
            main: darkMode ? "#90caf9" : "#1976d2",
          },
          secondary: {
            main: darkMode ? "#f48fb1" : "#dc004e",
          },
          background: {
            default: darkMode ? "#303030" : "#f5f5f5",
            paper: darkMode ? "#424242" : "#ffffff",
          },
        },
        typography: {
          fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
          h4: {
            fontWeight: 600,
          },
        },
        components: {
          MuiDrawer: {
            styleOverrides: {
              paper: {
                backgroundColor: darkMode ? "#212121" : "#1976d2",
                color: "#ffffff",
              },
            },
          },
          MuiListItemIcon: {
            styleOverrides: {
              root: {
                color: "inherit",
              },
            },
          },
          MuiPaper: {
            styleOverrides: {
              root: {
                transition: "box-shadow 300ms cubic-bezier(0.4, 0, 0.2, 1) 0ms",
                "&:hover": {
                  boxShadow: "0px 6px 12px -2px rgba(0,0,0,0.2)",
                },
              },
            },
          },
          MuiButton: {
            styleOverrides: {
              root: {
                borderRadius: 8,
              },
            },
          },
        },
      }),
    [darkMode]
  );

  const loadData = async () => {
    // Try Supabase first; null = not configured / failed / no shop -> localStorage fallback.
    const [remoteTires, remoteSales, remoteInventory, remoteDeliveries] =
      await Promise.all([
        loadTable("tires"),
        loadTable("sales"),
        loadTable("inventory"),
        loadTable("deliveries"),
      ]);
    const localTires = safeParse("tires", []);
    const localSales = safeParse("sales", []);
    const localInventory = safeParse("inventory", []);
    const localDeliveries = safeParse("deliveries", []);
    // Wipe-guard: cloud reachable but returned zero rows while this browser
    // holds cached rows -> keep the LOCAL rows on screen (the cloud is NOT
    // authoritative here) and offer a one-click upload instead.
    // Without this, the empty array overwrites the cache and data is lost.
    const guard = (remote, local) =>
      remote !== null && remote.length === 0 && local.length > 0 ? local : remote;
    const effTires = guard(remoteTires, localTires);
    const effSales = guard(remoteSales, localSales);
    const effInventory = guard(remoteInventory, localInventory);
    const effDeliveries = guard(remoteDeliveries, localDeliveries);
    setTires(effTires !== null ? effTires : localTires);
    setSales(effSales !== null ? effSales : localSales);
    setHotelTires(safeParse("hotelTires", []));
    setInventory(effInventory !== null ? effInventory : localInventory);
    setDeliveries(effDeliveries !== null ? effDeliveries : localDeliveries);
    // Diagnostic: cloud reachable but returned zero rows while this browser
    // previously cached rows -> rows were never uploaded, or wrong shop, or
    // RLS/filtering. NOT deleted data.
    if (
      isSupabaseConfigured() &&
      shop?.id &&
      remoteTires !== null &&
      remoteTires.length === 0 &&
      localTires.length > 0
    ) {
      setPendingUpload({
        tires: localTires.length,
        sales:
          remoteSales !== null && remoteSales.length === 0 ? localSales.length : 0,
        inventory:
          remoteInventory !== null && remoteInventory.length === 0
            ? localInventory.length
            : 0,
        deliveries:
          remoteDeliveries !== null && remoteDeliveries.length === 0
            ? localDeliveries.length
            : 0,
      });
      setStorageWarning(
        `Showing ${localTires.length} locally cached tire(s) for shop "${shop?.name || shop.id}" — the cloud has none yet. They were never uploaded (or belong to another shop). Your data is NOT deleted. Upload it now or dismiss.`
      );
    } else {
      setPendingUpload(null);
    }
    loadedRef.current = true;
  };

  useEffect(() => {
    // Cloud mode waits for a shop (tenant isolation); offline loads at once.
    if (isSupabaseConfigured() && !shop) {
      loadedRef.current = false;
      return;
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop?.id]);

  const handleSyncUpload = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await syncLocalToCloud();
      if (!res || !res.ok) {
        setStorageWarning(
          res && res.error
            ? `Upload failed: ${res.error}`
            : "Upload failed. Check your connection and shop, then retry."
        );
      } else if (res.totalFailed > 0) {
        setStorageWarning(
          `Uploaded ${res.totalUploaded} record(s); ${res.totalFailed} failed (see console). ${res.totalSkipped} already in the cloud were skipped.`
        );
      } else {
        setStorageWarning("");
        setPendingUpload(null);
      }
      await loadData();
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (!loadedRef.current) return;
    safeSave("tires", tires);
  }, [tires]);

  useEffect(() => {
    if (!loadedRef.current) return;
    safeSave("sales", sales);
  }, [sales]);

  useEffect(() => {
    if (!loadedRef.current) return;
    safeSave("hotelTires", hotelTires);
  }, [hotelTires]);

  useEffect(() => {
    if (!loadedRef.current) return;
    safeSave("inventory", inventory);
  }, [inventory]);

  useEffect(() => {
    if (!loadedRef.current) return;
    safeSave("deliveries", deliveries);
  }, [deliveries]);

  const addTire = (tire) => {
    const id = tire?.id ?? newId();
    // Defense in depth: SKU identity must stay unique (the form pre-checks
    // and shows the message; this guards programmatic callers).
    const sku = String(tire?.sku ?? "").trim();
    if (
      sku !== "" &&
      (tires || []).some(
        (t) => String(t?.sku ?? "").trim().toLowerCase() === sku.toLowerCase()
      )
    ) {
      console.error("Add tire failed: duplicate SKU", sku);
      return false;
    }
    const stock = Number(tire.stock);
    const safeStock = Number.isInteger(stock) && stock >= 0 ? stock : 0;
    // Split cost vs retail: legacy `price` is treated as cost for back-compat.
    const rawCost =
      tire.costPrice !== undefined && tire.costPrice !== "" ? tire.costPrice : tire.price;
    const rawRetail =
      tire.retailPrice !== undefined && tire.retailPrice !== "" ? tire.retailPrice : rawCost;
    const costNum = Number(rawCost);
    const retailNum = Number(rawRetail);
    const safeCost = Number.isFinite(costNum) && costNum >= 0 ? costNum : 0;
    const safeRetail = Number.isFinite(retailNum) && retailNum >= 0 ? retailNum : safeCost;
    const newTire = {
      ...tire,
      id,
      price: safeCost,
      costPrice: safeCost,
      retailPrice: safeRetail,
      stock: safeStock,
      sku,
      barcode: String(tire?.barcode ?? "").trim(),
    };
    setTires((prevTires) => [...prevTires, newTire]);
    // Single source of truth: tires[].stock is canonical; inventory mirrors it.
    updateInventory(id, safeStock, "increase");
    // Persist to Supabase when configured (fire-and-forget, local stays source of truth offline).
    insertRow("tires", newTire).then((saved) => {
      const finalId = saved && saved.id ? saved.id : id;
      // Keep the remote inventory mirror in lockstep with tires[].stock.
      upsertInventoryRow(finalId, safeStock);
      // Reconcile temp id -> DB uuid so later sales/deliveries keep FK integrity.
      if (saved && saved.id && String(saved.id) !== String(id)) {
        const savedId = saved.id;
        setTires((prev) =>
          (prev || []).map((t) =>
            String(t?.id) === String(id) ? { ...t, id: savedId } : t
          )
        );
        setInventory((prev) =>
          (prev || []).map((item) =>
            String(item?.tireId) === String(id) ? { ...item, tireId: savedId } : item
          )
        );
        setDeliveries((prev) =>
          (prev || []).map((d) =>
            String(d?.tireId) === String(id) ? { ...d, tireId: savedId } : d
          )
        );
      }
    });
    return id;
  };

  const addSale = (sale) => {
    const tire = tires.find((t) => String(t.id) === String(sale.tireId));
    if (!tire) {
      console.error("Sale failed: tire not found for tireId", sale.tireId);
      return false;
    }
    const saleQuantity = Number(sale.quantity);
    const tireStock = Number(tire.stock);
    if (!Number.isInteger(saleQuantity) || saleQuantity <= 0) {
      console.error("Sale failed: quantity must be a positive integer");
      return false;
    }
    if (Number.isNaN(tireStock) || saleQuantity > tireStock) {
      console.error("Sale failed: quantity exceeds stock");
      return false;
    }
    // Reject missing/invalid prices instead of coercing to 0 (which would
    // fabricate a -cost*qty "profit"). Empty is only auto-filled from an
    // explicitly set retail price — never from wholesale cost.
    const priceMissing =
      sale.price === "" || sale.price === undefined || sale.price === null;
    const retail = getRetail(tire);
    let effectivePrice;
    if (priceMissing) {
      if (!Number.isFinite(retail)) {
        console.error("Sale failed: sale price is required (no retail price set on tire)");
        return false;
      }
      effectivePrice = retail;
    } else {
      const parsed = Number(sale.price);
      if (!Number.isFinite(parsed) || parsed < 0) {
        console.error("Sale failed: sale price must be a number >= 0");
        return false;
      }
      effectivePrice = parsed;
    }
    // Profit = (sale price - wholesale cost) * qty.
    const costBasis = getCost(tire);
    const profit = (effectivePrice - costBasis) * saleQuantity;
    const record = {
      ...sale,
      quantity: saleQuantity,
      price: effectivePrice,
      date: sale.date || new Date().toISOString().slice(0, 10),
      customerName: sale.customerName || "",
      currency: sale.currency || tire.currency || getCurrency(),
      id: sale?.id ?? newId(),
      profit,
    };
    setSales((prevSales) => [...prevSales, record]);
    // Keep BOTH states in lockstep — this is the split-brain fix.
    updateStock(sale.tireId, saleQuantity);
    updateInventory(sale.tireId, saleQuantity, "decrease");
    insertRow("sales", record);
    return true;
  };

  const updateStock = (tireId, soldQuantity) => {
    if (tireId === undefined || tireId === null) return;
    const qty = Number(soldQuantity);
    if (Number.isNaN(qty)) return;
    setTires((prevTires) =>
      prevTires.map((tire) =>
        String(tire.id) === String(tireId)
          ? { ...tire, stock: Number(tire.stock || 0) - qty }
          : tire
      )
    );
    // Sync the decremented stock to Supabase so reloads don't revert it.
    const current = (tires || []).find((t) => String(t?.id) === String(tireId));
    if (current) {
      const newStock = (Number(current.stock) || 0) - qty;
      updateRow("tires", tireId, { stock: newStock });
    }
  };

  const addHotelTire = (hotelTire) => {
    setHotelTires((prevHotelTires) => [
      ...prevHotelTires,
      { ...hotelTire, id: hotelTire?.id ?? newId() },
    ]);
  };

  const updateInventory = (tireId, quantity, action) => {
    if (tireId === undefined || tireId === null) return;
    const qty = Number(quantity);
    if (Number.isNaN(qty)) return;
    // Best-effort remote mirror: compute absolute quantity from current state.
    const existing = (inventory || []).find(
      (item) => String(item?.tireId) === String(tireId)
    );
    const currentQty = Number(existing?.quantity) || 0;
    const nextQty =
      action === "increase" ? currentQty + qty : currentQty - qty;
    upsertInventoryRow(tireId, nextQty);
    setInventory((prevInventory) => {
      const existingItem = (prevInventory || []).find(
        (item) => String(item.tireId) === String(tireId)
      );
      if (existingItem) {
        const currentQty = Number(existingItem.quantity) || 0;
        return prevInventory.map((item) =>
          String(item.tireId) === String(tireId)
            ? {
                ...item,
                quantity:
                  action === "increase" ? currentQty + qty : currentQty - qty,
              }
            : item
        );
      } else {
        return [
          ...(prevInventory || []),
          { tireId, quantity: action === "increase" ? qty : 0 - qty },
        ];
      }
    });
  };

  // Direct tire update (inline edit). Keeps inventory mirror in sync when
  // stock changes instead of leaving the two counts diverged.
  // Syncs to Supabase so edits survive reload.
  const updateTire = (tireId, patch) => {
    if (tireId === undefined || tireId === null || !patch) return false;
    let nextStock = null;
    if (patch.stock !== undefined) {
      const s = Number(patch.stock);
      if (!Number.isInteger(s) || s < 0) return false;
      nextStock = s;
    }
    setTires((prev) =>
      (prev || []).map((t) =>
        String(t?.id) === String(tireId) ? { ...t, ...patch } : t
      )
    );
    if (nextStock !== null) {
      // Mirror semantics: inventory.quantity tracks tires[].stock exactly.
      setInventory((prev) => {
        const exists = (prev || []).some(
          (item) => String(item?.tireId) === String(tireId)
        );
        if (exists) {
          return (prev || []).map((item) =>
            String(item?.tireId) === String(tireId)
              ? { ...item, quantity: nextStock }
              : item
          );
        }
        return [...(prev || []), { tireId, quantity: nextStock }];
      });
    }
    updateRow("tires", tireId, patch);
    if (nextStock !== null) {
      upsertInventoryRow(tireId, nextStock);
    }
    return true;
  };

  // Cascading delete — removes tire + its inventory mirror + its deliveries so
  // no "Unknown tire" ghost rows linger. Sales are kept for accounting.
  // Deletes propagate to Supabase (children first, then the tire itself).
  const deleteTire = (tireId) => {
    if (tireId === undefined || tireId === null) return;
    const key = String(tireId);
    setTires((prev) => (prev || []).filter((t) => String(t?.id) !== key));
    setInventory((prev) =>
      (prev || []).filter((item) => String(item?.tireId) !== key)
    );
    setDeliveries((prev) =>
      (prev || []).filter((d) => String(d?.tireId) !== key)
    );
    deleteRowsByTireId("inventory", tireId);
    deleteRowsByTireId("deliveries", tireId);
    deleteRow("tires", tireId);
  };

  // Remove inventory/delivery rows whose tire no longer exists.
  const purgeOrphanRecords = () => {
    const validIds = new Set((tires || []).map((t) => String(t?.id)));
    const orphanTireIds = new Set();
    (inventory || []).forEach((item) => {
      if (item && !validIds.has(String(item?.tireId))) {
        orphanTireIds.add(item.tireId);
      }
    });
    (deliveries || []).forEach((d) => {
      if (d && !validIds.has(String(d?.tireId))) {
        orphanTireIds.add(d.tireId);
      }
    });
    setInventory((prev) =>
      (prev || []).filter((item) => validIds.has(String(item?.tireId)))
    );
    setDeliveries((prev) =>
      (prev || []).filter((d) => validIds.has(String(d?.tireId)))
    );
    // Remove the same orphans remotely so they don't reappear on reload.
    orphanTireIds.forEach((orphanId) => {
      deleteRowsByTireId("inventory", orphanId);
      deleteRowsByTireId("deliveries", orphanId);
    });
  };

  // One-way reconcile: ensure every tire has an inventory mirror equal to its
  // stock. Repairs legacy drift where deliveries bumped only one side.
  const resyncInventoryFromTires = () => {
    setInventory((prev) => {
      const prevMap = {};
      (prev || []).forEach((item) => {
        if (item) prevMap[String(item.tireId)] = item;
      });
      return (tires || []).map((t) => {
        const k = String(t?.id);
        const existing = prevMap[k];
        return existing
          ? { ...existing, tireId: t.id, quantity: Number(t?.stock) || 0 }
          : { tireId: t.id, quantity: Number(t?.stock) || 0 };
      });
    });
    (tires || []).forEach((t) => {
      if (t) upsertInventoryRow(t.id, Number(t?.stock) || 0);
    });
  };

  const addDelivery = (delivery) => {
    if (!delivery || delivery.tireId === undefined || delivery.tireId === null)
      return;
    const qty = Number(delivery.quantity);
    if (!Number.isInteger(qty) || qty <= 0) return;
    const date = delivery.date || new Date().toISOString().slice(0, 10);
    const record = { ...delivery, quantity: qty, date, id: delivery?.id ?? newId() };
    setDeliveries((prevDeliveries) => [...prevDeliveries, record]);
    // FIX: deliveries must bump BOTH states. Previously only
    // inventory.quantity moved, leaving tires[].stock (and SaleForm checks)
    // stuck at the old value.
    setTires((prevTires) =>
      (prevTires || []).map((t) =>
        String(t?.id) === String(delivery.tireId)
          ? { ...t, stock: (Number(t?.stock) || 0) + qty }
          : t
      )
    );
    updateInventory(delivery.tireId, qty, "increase");
    insertRow("deliveries", record);
    // Sync the bumped stock so reloads don't revert it.
    const current = (tires || []).find(
      (t) => String(t?.id) === String(delivery.tireId)
    );
    if (current) {
      updateRow("tires", delivery.tireId, {
        stock: (Number(current.stock) || 0) + qty,
      });
    }
  };

  const deleteDelivery = (id) => {
    // Read target outside the updater: calling setState inside an updater is
    // impure and double-fires under StrictMode, corrupting stock counts.
    const target = (deliveries || []).find((d) => String(d?.id) === String(id));
    if (target) {
      // Revert BOTH sides of the delivery increase.
      const qty = Number(target.quantity) || 0;
      if (qty > 0 && target.tireId !== undefined && target.tireId !== null) {
        setInventory((prevInv) =>
          (prevInv || []).map((item) =>
            String(item.tireId) === String(target.tireId)
              ? { ...item, quantity: (Number(item.quantity) || 0) - qty }
              : item
          )
        );
        setTires((prevTires) =>
          (prevTires || []).map((t) =>
            String(t?.id) === String(target.tireId)
              ? { ...t, stock: (Number(t?.stock) || 0) - qty }
              : t
          )
        );
        // Sync the reverted stock + inventory mirror to Supabase.
        const currentTire = (tires || []).find(
          (t) => String(t?.id) === String(target.tireId)
        );
        if (currentTire) {
          const newStock = (Number(currentTire.stock) || 0) - qty;
          updateRow("tires", target.tireId, { stock: newStock });
          upsertInventoryRow(target.tireId, newStock);
        } else {
          const invItem = (inventory || []).find(
            (item) => String(item?.tireId) === String(target.tireId)
          );
          if (invItem) {
            upsertInventoryRow(
              target.tireId,
              (Number(invItem.quantity) || 0) - qty
            );
          }
        }
      }
    }
    setDeliveries((prev) => (prev || []).filter((d) => String(d?.id) !== String(id)));
    deleteRow("deliveries", id);
  };

  // Void a sale: remove the record, restore stock on BOTH states and sync.
  // The ledger auto-posting tagged [sale:ID] is garbage-collected by
  // CurrentAccount (balance reversed), so books stay consistent.
  const deleteSale = (saleId) => {
    const target = (sales || []).find((s) => String(s?.id) === String(saleId));
    if (!target) return false;
    const qty = Number(target.quantity) || 0;
    const key = String(saleId);
    setSales((prev) => (prev || []).filter((s) => String(s?.id) !== key));
    if (qty > 0 && target.tireId !== undefined && target.tireId !== null) {
      setTires((prevTires) =>
        (prevTires || []).map((t) =>
          String(t?.id) === String(target.tireId)
            ? { ...t, stock: (Number(t?.stock) || 0) + qty }
            : t
        )
      );
      updateInventory(target.tireId, qty, "increase");
      const current = (tires || []).find(
        (t) => String(t?.id) === String(target.tireId)
      );
      if (current) {
        const newStock = (Number(current.stock) || 0) + qty;
        updateRow("tires", target.tireId, { stock: newStock });
        upsertInventoryRow(target.tireId, newStock);
      }
    }
    deleteRow("sales", saleId);
    return true;
  };

  const handleDrawerToggle = () => {
    setOpen(!open);
  };

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  const handleMenu = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const canSeeTeam = !isSupabaseConfigured() || (shop && shop.role === "Admin");

  const navGroups = useMemo(() => [
    {
      group: null, // Top-level
      items: [
        { text: "Dashboard", icon: <DashboardIcon />, component: "Dashboard" },
      ],
    },
    {
      group: "Inventory",
      items: [
        { text: "Tire List", icon: <ListAltIcon />, component: "TireList" },
        { text: "Add Tire", icon: <AddCircleIcon />, component: "TireForm" },
        { text: "Inventory", icon: <InventoryIcon />, component: "Inventory" },
        { text: "Deliveries", icon: <LocalShippingIcon />, component: "Deliveries" },
      ],
    },
    {
      group: "Sales & Accounting",
      items: [
        { text: "Sell Tire", icon: <SellIcon />, component: "SaleForm" },
        { text: "Current Account", icon: <AnalyticsIcon />, component: "CurrentAccount" },
      ],
    },
    {
      group: "Service",
      items: [
        { text: "Tire Hotel", icon: <HotelIcon />, component: "TireHotel" },
        { text: "Appointment System", icon: <CalendarTodayIcon />, component: "AppointmentSystem" },
        { text: "Vehicle Tracking", icon: <DirectionsCarIcon />, component: "VehicleTracking" },
        { text: "Worker Tracking", icon: <PersonIcon />, component: "WorkerTracking" },
      ],
    },
    {
      group: "System",
      items: [
        ...(canSeeTeam
          ? [{ text: "Team", icon: <GroupIcon />, component: "TeamManagement" }]
          : []),
        { text: "Settings", icon: <SettingsIcon />, component: "Settings" },
      ],
    },
  ], [canSeeTeam]);

  const drawer = (
    <div>
      <Logo>
        <TireRepairIcon sx={{ fontSize: 40, mr: 1 }} />
        <Typography variant="h6" noWrap component="div">
          Black Wheel
        </Typography>
      </Logo>
      <Divider />
      <Box sx={{ p: 2, display: "flex", alignItems: "center" }}>
        <Avatar src={user?.avatar || ""} alt={user?.name || "User"} sx={{ mr: 2, bgcolor: "secondary.main" }}>
          {(user?.name || "U").charAt(0).toUpperCase()}
        </Avatar>
        <Box>
          <Typography variant="subtitle1">{user?.name || "User"}</Typography>
          <Typography variant="body2" color="textSecondary">
            {user?.role || "Staff"}
          </Typography>
          {shop?.name && (
            <Typography variant="caption" color="textSecondary">
              {shop.name}
            </Typography>
          )}
        </Box>
      </Box>
      <Divider />
      <List sx={{ py: 0 }}>
        {navGroups.map((section, sIdx) => (
          <React.Fragment key={section.group || `sec-${sIdx}`}>
            {section.group && (
              <ListSubheader
                sx={{
                  bgcolor: "transparent",
                  color: darkMode ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.9)",
                  fontWeight: 700,
                  fontSize: "0.75rem",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  lineHeight: "32px",
                  mt: sIdx > 0 ? 1 : 0,
                }}
              >
                {section.group}
              </ListSubheader>
            )}
            {section.items.map((item) => (
              <ListItem
                button
                key={item.text}
                onClick={() => {
                  setSelectedComponent(item.component);
                  if (isMobile) setOpen(false);
                }}
                selected={selectedComponent === item.component}
                sx={{
                  py: 0.8,
                  "&.Mui-selected": {
                    backgroundColor: darkMode ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.25)",
                    "&:hover": {
                      backgroundColor: darkMode ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.32)",
                    },
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
                <ListItemText primary={item.text} primaryTypographyProps={{ fontSize: "0.9rem" }} />
              </ListItem>
            ))}
            {sIdx < navGroups.length - 1 && <Divider sx={{ my: 0.5, borderColor: "rgba(255,255,255,0.12)" }} />}
          </React.Fragment>
        ))}
      </List>
    </div>
  );

  const renderComponent = () => {
    switch (selectedComponent) {
      case "Dashboard":
        return <Dashboard tires={tires} sales={sales} />;
      case "TireForm":
        return <TireForm addTire={addTire} tires={tires} />;
      case "SaleForm":
        return <SaleForm tires={tires} addSale={addSale} salesHistory={sales} onDeleteSale={deleteSale} />;
      case "TireHotel":
        return (
          <TireHotel hotelTires={hotelTires} addHotelTire={addHotelTire} />
        );
      case "TireList":
        return (
          <TireList
            tires={tires}
            setTires={setTires}
            sales={sales}
            addSale={addSale}
            onUpdateTire={updateTire}
            onDeleteTire={deleteTire}
            onDeleteSale={deleteSale}
            onAddNew={() => setSelectedComponent("TireForm")}
          />
        );
      case "CurrentAccount":
        return <CurrentAccount tires={tires} sales={sales} deliveries={deliveries} user={user} shop={shop} />;
      case "Inventory":
        return (
          <Inventory
            inventory={inventory}
            tires={tires}
            onPurgeOrphans={purgeOrphanRecords}
            onResync={resyncInventoryFromTires}
          />
        );
      case "VehicleTracking":
        return <VehicleTracking />;
      case "WorkerTracking":
        return <WorkerTracking user={user} shop={shop} />;
      case "AppointmentSystem":
        return <AppointmentSystem />;
      case "Deliveries":
        return (
          <Deliveries
            deliveries={deliveries}
            addDelivery={addDelivery}
            onDeleteDelivery={deleteDelivery}
            tires={tires}
          />
        );
      case "Settings":
        return <Settings />;
      case "TeamManagement":
        return (
          <TeamManagement
            shop={shop}
            currentUser={user}
            onShopRenamed={(name) =>
              setShop((prev) => (prev ? { ...prev, name } : prev))
            }
          />
        );
      default:
        return <Dashboard tires={tires} sales={sales} />;
    }
  };

  if (!user) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <ErrorBoundary>
          <Suspense fallback={<Box sx={{ display: "flex", justifyContent: "center", p: 4 }}><CircularProgress /></Box>}>
            <AuthModal
              darkMode={darkMode}
              onToggleDarkMode={() => setDarkMode((prev) => !prev)}
            onLoginSuccess={(u) => {
              if (!u) return;
              if (isSupabaseConfigured()) {
                // Memberships already resolved by AuthModal; shop-less users
                // get a personal shop automatically (no shop typing).
                autoProvisionShop(u, u.memberships || []);
              } else {
                setUser(u);
                try {
                  localStorage.setItem("blackwheel_auth_user", JSON.stringify(u));
                } catch (e) {
                  // ignore
                }
              }
            }}
            />
          </Suspense>
        </ErrorBoundary>
      </ThemeProvider>
    );
  }

  // Fallback gate: only reached when auto-provisioning failed or the user
  // belongs to several shops and must pick one. Normal users never see this.
  if (isSupabaseConfigured() && !shop) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <ErrorBoundary>
          <Suspense fallback={<Box sx={{ display: "flex", justifyContent: "center", p: 4 }}><CircularProgress /></Box>}>
            <ShopGate
              authUser={user}
              memberships={user.memberships || []}
              onEnter={(m) => {
                if (!m) return;
                setShop({ id: m.shopId, name: m.shopName, role: m.role, profileId: m.profileId });
                setUser((prev) => (prev ? { ...prev, role: m.role } : prev));
              }}
              onSignOut={handleSignOut}
            />
          </Suspense>
        </ErrorBoundary>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Box sx={{ display: "flex" }}>
          <StyledAppBar position="fixed" open={open}>
            <Toolbar>
              <IconButton
                color="inherit"
                aria-label="open drawer"
                onClick={handleDrawerToggle}
                edge="start"
                sx={{ mr: 2, ...(open && { display: { sm: "none" } }) }}
              >
                <MenuIcon />
              </IconButton>
              <Typography
                variant="h6"
                noWrap
                component="div"
                sx={{ flexGrow: 1 }}
              >
                {componentTitles[selectedComponent] || selectedComponent}
              </Typography>
              <Tooltip title={lowStockCount > 0 ? `${lowStockCount} tire(s) with low stock (≤ threshold)` : "All tires have adequate stock"}>
                <IconButton
                  color="inherit"
                  onClick={() => setSelectedComponent("Inventory")}
                >
                  <StyledBadge badgeContent={lowStockCount} color="error">
                    <NotificationsIcon />
                  </StyledBadge>
                </IconButton>
              </Tooltip>
              <IconButton
                sx={{ ml: 1 }}
                onClick={toggleDarkMode}
                color="inherit"
              >
                {darkMode ? <Brightness7Icon /> : <Brightness4Icon />}
              </IconButton>
              <Tooltip title={user?.name || "Account settings"}>
                <IconButton onClick={handleMenu} color="inherit">
                  <Avatar
                    src={user?.avatar || ""}
                    alt={user?.name || "User"}
                    sx={{ width: 32, height: 32, bgcolor: "secondary.main", fontSize: 14 }}
                  >
                    {(user?.name || "U").charAt(0).toUpperCase()}
                  </Avatar>
                </IconButton>
              </Tooltip>
              <Menu
                id="menu-appbar"
                anchorEl={anchorEl}
                anchorOrigin={{
                  vertical: "top",
                  horizontal: "right",
                }}
                keepMounted
                transformOrigin={{
                  vertical: "top",
                  horizontal: "right",
                }}
                open={Boolean(anchorEl)}
                onClose={handleClose}
              >
                <MenuItem
                  onClick={() => {
                    setSelectedComponent("Settings");
                    handleClose();
                  }}
                >
                  <ListItemIcon>
                    <SettingsIcon fontSize="small" />
                  </ListItemIcon>
                  <Typography variant="inherit">Settings</Typography>
                </MenuItem>
                {isSupabaseConfigured() && (
                  <MenuItem
                    onClick={() => {
                      handleClose();
                      setCurrentShopId("");
                      setShop(null);
                      setSelectedComponent("Dashboard");
                    }}
                  >
                    <ListItemIcon>
                      <StoreIcon fontSize="small" />
                    </ListItemIcon>
                    <Typography variant="inherit">Switch shop</Typography>
                  </MenuItem>
                )}
                <MenuItem
                  onClick={async () => {
                    handleClose();
                    await handleSignOut();
                  }}
                >
                  <ListItemIcon>
                    <ExitToAppIcon fontSize="small" />
                  </ListItemIcon>
                  <Typography variant="inherit">Logout</Typography>
                </MenuItem>
              </Menu>
            </Toolbar>
          </StyledAppBar>
          {isMobile ? (
            <SwipeableDrawer
              anchor="left"
              open={open}
              onClose={handleDrawerToggle}
              onOpen={handleDrawerToggle}
              sx={{
                width: drawerWidth,
                flexShrink: 0,
                "& .MuiDrawer-paper": {
                  width: drawerWidth,
                  boxSizing: "border-box",
                },
              }}
            >
              {drawer}
            </SwipeableDrawer>
          ) : (
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
              open={open}
            >
              {drawer}
            </Drawer>
          )}
          <Main open={open}>
            <DrawerHeader />
            <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
              {storageWarning && (
                <Paper
                  elevation={0}
                  sx={{
                    p: 2,
                    mb: 2,
                    borderRadius: "8px",
                    bgcolor: "warning.light",
                    border: "1px solid",
                    borderColor: "warning.main",
                  }}
                >
                  <Typography variant="body2" color="textSecondary">
                    {storageWarning}{" "}
                    {pendingUpload && (
                      <Button
                        size="small"
                        variant="contained"
                        disableElevation
                        disabled={syncing}
                        onClick={handleSyncUpload}
                        sx={{ ml: 1, mr: 1, textTransform: "none", fontWeight: 700 }}
                      >
                        {syncing
                          ? "Uploading…"
                          : `Upload ${Object.values(pendingUpload).reduce(
                              (n, v) => n + (Number(v) || 0),
                              0
                            )} local records to cloud`}
                      </Button>
                    )}
                    <span
                      style={{ textDecoration: "underline", cursor: "pointer" }}
                      onClick={() => setStorageWarning("")}
                    >
                      Dismiss
                    </span>
                  </Typography>
                </Paper>
              )}
              <Fade in={true} timeout={1000}>
                <Paper elevation={3} sx={{ p: 2, borderRadius: "8px" }}>
                  <ErrorBoundary>
                    <Suspense fallback={<Box sx={{ display: "flex", justifyContent: "center", p: 4 }}><CircularProgress /></Box>}>
                      {renderComponent()}
                    </Suspense>
                  </ErrorBoundary>
                </Paper>
              </Fade>
            </Container>
          </Main>
        </Box>
      </Router>
    </ThemeProvider>
  );
};

export default App;
