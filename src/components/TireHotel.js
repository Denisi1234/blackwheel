import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  TextField, Button, Grid, Paper, Typography, Box, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  Snackbar, Alert, Chip, Tooltip, FormControlLabel, Switch, ThemeProvider, createTheme,
  Avatar, Card, CardContent, CardActions, InputAdornment, Tabs, Tab,
  Menu, MenuItem, CircularProgress
} from '@mui/material';
import SuccessModal from './SuccessModal';
import { alpha, styled } from '@mui/material/styles';
import { DataGrid, GridToolbar } from '@mui/x-data-grid';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import PhotoCamera from '@mui/icons-material/PhotoCamera';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import PrintIcon from '@mui/icons-material/Print';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import SearchIcon from '@mui/icons-material/Search';
import DashboardIcon from '@mui/icons-material/Dashboard';
import InventoryIcon from '@mui/icons-material/Inventory';
import PersonIcon from '@mui/icons-material/Person';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import BarChartIcon from '@mui/icons-material/BarChart';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, LineChart, Line, ResponsiveContainer } from 'recharts';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { jsPDF } from "jspdf";
import 'jspdf-autotable';
import {
  DOC_BRAND,
  paintHeader,
  paintFooter,
  moneyTable,
  sectionCaption,
  downloadCsv,
  datedName,
} from "../lib/documents";
import {
  loadTable,
  insertRow,
  updateRow,
  deleteRow,
  newId,
} from "../lib/store";

// Local component overrides only. Palette / mode come from the app-level
// theme (see App.js) so the global dark-mode toggle applies here too — this
// module used to force its own light palette + CssBaseline.
const hotelThemeOverrides = {
  typography: {
    fontFamily: 'Roboto, "Helvetica Neue", Arial, sans-serif',
    h4: { fontWeight: 700 },
    h6: { fontWeight: 600 },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 600,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
          },
        },
      },
    },
  },
};
const extendAppTheme = (outerTheme) => createTheme(outerTheme, hotelThemeOverrides);

const StyledDataGrid = styled(DataGrid)(({ theme }) => ({
  border: 0,
  color: theme.palette.text.primary,
  fontFamily: theme.typography.fontFamily,
  WebkitFontSmoothing: 'auto',
  letterSpacing: 'normal',
  '& .MuiDataGrid-columnsContainer': {
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.primary.contrastText,
  },
  '& .MuiDataGrid-iconSeparator': {
    display: 'none',
  },
  '& .MuiDataGrid-columnHeader, .MuiDataGrid-cell': {
    borderRight: `1px solid ${theme.palette.divider}`,
  },
  '& .MuiDataGrid-columnsContainer, .MuiDataGrid-cell': {
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  '& .MuiDataGrid-cell': {
    color: theme.palette.text.primary,
  },
  '& .MuiPaginationItem-root': {
    borderRadius: 4,
  },
  '& .MuiDataGrid-toolbarContainer': {
    padding: theme.spacing(2),
    backgroundColor: alpha(theme.palette.primary.main, 0.08),
    '& .MuiButton-root': {
      marginRight: theme.spacing(1.5),
    },
  },
}));

const TireImage = styled('img')({
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  borderRadius: '8px',
});

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#FF6B6B', '#4ECDC4'];

const localizer = momentLocalizer(moment);

function TireHotel() {
  const [hotelTires, setHotelTires] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [newTire, setNewTire] = useState({
    customerName: '', brand: '', size: '', quantity: '',
    storageDate: '', retrievalDate: '', photo: null, notes: '',
    plateNumber: '', vehicleModel: ''
  });
  const [editingTire, setEditingTire] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [isSaving, setIsSaving] = useState(false);
  const [successModal, setSuccessModal] = useState({ open: false, title: '', message: '', details: [] });
  const [showExpiredOnly, setShowExpiredOnly] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [events, setEvents] = useState([]);
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 10 });
  const [isCustomerDialogOpen, setIsCustomerDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [customerForm, setCustomerForm] = useState({ name: '', email: '', phone: '' });
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const loadedRef = useRef(false);

  // Pure cloud: every read comes from Postgres. A fresh shop starts
  // empty and stays in sync — no mock seeds.
  useEffect(() => {
    const loadAll = async () => {
      try {
        const [remoteTires, remoteCustomers] = await Promise.all([
          loadTable("hotelTires"),
          loadTable("hotelCustomers"),
        ]);
        setHotelTires(Array.isArray(remoteTires) ? remoteTires : []);
        setCustomers(Array.isArray(remoteCustomers) ? remoteCustomers : []);
      } catch (e) {
        setHotelTires([]);
        setCustomers([]);
      } finally {
        loadedRef.current = true;
      }
    };
    loadAll();
  }, []);

  useEffect(() => {
    const tireEvents = hotelTires
      .filter((tire) => tire.storageDate && !Number.isNaN(new Date(tire.storageDate).getTime()))
      .map(tire => {
        const start = new Date(tire.storageDate);
        const endCandidate = tire.retrievalDate ? new Date(tire.retrievalDate) : null;
        const end = endCandidate && !Number.isNaN(endCandidate.getTime()) ? endCandidate : start;
        return {
          title: `${tire.customerName} - ${tire.brand}`,
          start,
          end,
          resource: tire,
        };
      });
    setEvents(tireEvents);
  }, [hotelTires]);

  const checkExpiredTires = useCallback(() => {
    const today = new Date();
    const expiredTires = hotelTires.filter(tire => 
      tire.retrievalDate && new Date(tire.retrievalDate) < today && !tire.retrieved
    );
    if (expiredTires.length > 0) {
      setSnackbar({
        open: true,
        message: `${expiredTires.length} tire(s) past retrieval date!`,
        severity: 'warning'
      });
    }
  }, [hotelTires]);

  useEffect(() => {
    checkExpiredTires();
  }, [checkExpiredTires]);

  const handleChange = (e) => {
    setNewTire({ ...newTire, [e.target.name]: e.target.value });
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewTire({ ...newTire, photo: reader.result });
      };
      reader.readAsDataURL(file);
    }
  };

  const matchCustomerId = useCallback((name, list) => {
    const clean = String(name || "").trim().toLowerCase();
    if (!clean) return "";
    const found = (list || customers || []).find(
      (c) => String(c?.name || "").trim().toLowerCase() === clean
    );
    return found ? found.id : "";
  }, [customers]);

  const addHotelTire = useCallback((tire) => {
    const record = {
      ...tire,
      id: tire?.id ?? newId(),
      retrieved: Boolean(tire?.retrieved),
      quantity: Number(tire?.quantity) || 4,
    };
    if (!record.customerId) {
      record.customerId = matchCustomerId(record.customerName);
    }
    setHotelTires(prevTires => [...prevTires, record]);
    insertRow("hotelTires", record).then((saved) => {
      if (saved && saved.id && String(saved.id) !== String(record.id)) {
        const savedId = saved.id;
        setHotelTires((prev) =>
          (prev || []).map((t) =>
            String(t?.id) === String(record.id) ? { ...t, id: savedId } : t
          )
        );
      }
    });
    return record.id;
  }, [matchCustomerId]);

  const updateHotelTire = useCallback((id, updatedTire) => {
    setHotelTires(prevTires =>
      prevTires.map(tire => String(tire?.id) === String(id) ? { ...tire, ...updatedTire } : tire)
    );
    updateRow("hotelTires", id, updatedTire);
  }, []);

  const removeHotelTire = useCallback((id) => {
    setHotelTires(prevTires => prevTires.filter(tire => String(tire?.id) !== String(id)));
    deleteRow("hotelTires", id);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsSaving(true);
    const isEdit = Boolean(editingTire);
    const snapshot = { ...newTire };
    const tireWithDates = {
      ...snapshot,
      quantity: Number(snapshot.quantity) || 0,
      storageDate: snapshot.storageDate ? new Date(snapshot.storageDate).toISOString() : '',
      retrievalDate: snapshot.retrievalDate ? new Date(snapshot.retrievalDate).toISOString() : ''
    };
    setTimeout(() => {
      if (isEdit) {
        updateHotelTire(editingTire.id, tireWithDates);
        setSnackbar({ open: true, message: 'Tire updated successfully', severity: 'success' });
      } else {
        addHotelTire(tireWithDates);
        setSnackbar({ open: true, message: 'New tire added successfully', severity: 'success' });
      }
      setSuccessModal({
        open: true,
        title: isEdit ? 'Tire Updated' : 'Tire Added',
        message: isEdit ? 'The tire record has been updated successfully.' : 'The new tire has been added to the hotel successfully.',
        details: [
          { label: 'Customer', value: snapshot.customerName || '-' },
          { label: 'Brand', value: snapshot.brand || '-' },
          { label: 'Size', value: snapshot.size || '-' },
          { label: 'Plate', value: snapshot.plateNumber || '-' },
        ],
      });
      resetForm();
      setIsSaving(false);
    }, 600);
  };

  const resetForm = () => {
    setNewTire({
      customerName: '', brand: '', size: '', quantity: '',
      storageDate: '', retrievalDate: '', photo: null, notes: '',
      plateNumber: '', vehicleModel: ''
    });
    setEditingTire(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (tire) => {
    setEditingTire(tire);
    const toInputDate = (v) => {
      if (!v) return '';
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return '';
      return d.toISOString().split('T')[0];
    };
    setNewTire({
      ...tire,
      storageDate: toInputDate(tire.storageDate),
      retrievalDate: toInputDate(tire.retrievalDate)
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id) => {
    removeHotelTire(id);
    setSnackbar({ open: true, message: 'Tire deleted successfully', severity: 'success' });
  };

  const handleRetrieve = (id) => {
    const tire = hotelTires.find(t => String(t?.id) === String(id));
    if (tire) {
      const updatedTire = { ...tire, retrievalDate: new Date().toISOString(), retrieved: true };
      updateHotelTire(id, updatedTire);
      setSnackbar({ open: true, message: 'Tire delivered', severity: 'info' });
    }
  };

  const filteredTires = useMemo(() => {
    const term = (searchTerm || '').toLowerCase();
    return hotelTires.filter(tire =>
      ((tire.customerName?.toLowerCase() || '').includes(term) ||
      (tire.brand?.toLowerCase() || '').includes(term) ||
      (tire.size?.toLowerCase() || '').includes(term) ||
      (tire.plateNumber?.toLowerCase() || '').includes(term)) &&
      (!showExpiredOnly || (tire.retrievalDate && !Number.isNaN(new Date(tire.retrievalDate).getTime()) && new Date(tire.retrievalDate) < new Date() && !tire.retrieved))
    );
  }, [hotelTires, searchTerm, showExpiredOnly]);

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString();
  };

  const columns = [
    {
      field: 'photo',
      headerName: 'Photo',
      width: 100,
      renderCell: (params) => (
        <Avatar
          src={params.value}
          variant="rounded"
          sx={{ width: 60, height: 60 }}
        >
          {(params.row.brand || '?')[0]}
        </Avatar>
      ),
    },
    { field: 'customerName', headerName: 'Customer Name', width: 150 },
    { field: 'plateNumber', headerName: 'License Plate', width: 120 },
    { field: 'vehicleModel', headerName: 'Vehicle Model', width: 150 },
    { field: 'brand', headerName: 'Brand', width: 120 },
    { field: 'size', headerName: 'Size', width: 120 },
    { field: 'quantity', headerName: 'Quantity', width: 80, type: 'number' },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      renderCell: (params) => (
        <Chip
          label={params.row.retrieved ? 'Delivered' : 'In Storage'}
          color={params.row.retrieved ? 'success' : 'primary'}
          icon={params.row.retrieved ? <LocalShippingIcon /> : <InventoryIcon />}
        />
      ),
    },
    {
      field: 'storageDate',
      headerName: 'Storage Date',
      width: 130,
      valueFormatter: (params) => formatDate(params.value),
    },
    {
      field: 'retrievalDate',
      headerName: 'Retrieval Date',
      width: 130,
      valueFormatter: (params) => formatDate(params.value),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 300,
      renderCell: (params) => (
        <Box>
          <Tooltip title="Edit">
            <IconButton onClick={() => handleEdit(params.row)}>
              <EditIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton onClick={() => handleDelete(params.row.id)}>
              <DeleteIcon />
            </IconButton>
          </Tooltip>
          {!params.row.retrieved && (
            <Tooltip title="Deliver">
              <Button variant="outlined" size="small" onClick={() => handleRetrieve(params.row.id)}>
                Deliver
              </Button>
            </Tooltip>
          )}
          <Tooltip title="Print Storage Slip">
            <IconButton onClick={() => generateStorageSlip(params.row)}>
              <PrintIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Generate Hotel Receipt">
            <IconButton onClick={() => generateHotelReceipt(params.row)}>
              <PictureAsPdfIcon />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ];

  const generateStorageSlip = (tire) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const margin = 10;
    const slipWidth = (pageWidth - 3 * margin) / 2;
    const slipHeight = (pageHeight - 3 * margin) / 2;

    const createSlip = (x, y) => {
      doc.setDrawColor(...DOC_BRAND.line);
      doc.rect(x, y, slipWidth, slipHeight);
      doc.setFillColor(...DOC_BRAND.primary);
      doc.rect(x, y, slipWidth, 14, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Tire Hotel Storage Slip", x + 5, y + 9);
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const lines = [
        `Customer: ${tire.customerName || "—"}`,
        `License Plate: ${tire.plateNumber || "—"}`,
        `Date: ${formatDate(tire.storageDate)}`,
        `Brand: ${tire.brand || "—"}  ·  Size: ${tire.size || "—"}  ·  Qty: ${tire.quantity ?? ""}`,
        `Retrieval: ${formatDate(tire.retrievalDate) || "—"}`,
        `Note: ${String(tire.notes || "—").slice(0, 60)}`,
      ];
      lines.forEach((line, i) => doc.text(line, x + 5, y + 24 + i * 8, { maxWidth: slipWidth - 10 }));
      doc.setFontSize(8);
      doc.setTextColor(...DOC_BRAND.muted);
      doc.text("Keep this slip — present it at pickup.", x + 5, y + slipHeight - 6);
    };

    createSlip(margin, margin);
    createSlip(margin * 2 + slipWidth, margin);
    createSlip(margin, margin * 2 + slipHeight);
    createSlip(margin * 2 + slipWidth, margin * 2 + slipHeight);

    doc.save(datedName("tire_hotel_storage_slip", "pdf"));
  };

  const generateHotelReceipt = (tire) => {
    const doc = new jsPDF();
    const startY = paintHeader(doc, {
      title: "Hotel Receipt",
      refNo: tire.plateNumber || "",
    });
    let y = sectionCaption(doc, "Customer", startY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(String(tire.customerName || "—").slice(0, 48), 14, y + 1);

    const infoRow = (label, value, row, col) => {
      const x = col === 0 ? 14 : 110;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...DOC_BRAND.muted);
      doc.text(label, x, y + 9 + row * 8);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(String(value ?? "—").slice(0, 34), x, y + 13.5 + row * 8);
    };
    y = sectionCaption(doc, "Vehicle & tires", y + 8);
    infoRow("License plate", tire.plateNumber, 0, 0);
    infoRow("Vehicle model", tire.vehicleModel, 1, 0);
    infoRow("Brand", tire.brand, 0, 1);
    infoRow("Size", tire.size, 1, 1);
    infoRow("Quantity", tire.quantity, 2, 0);
    infoRow("Status", tire.retrieved ? "Delivered" : "In Storage", 2, 1);

    y = moneyTable(doc, {
      startY: y + 34,
      head: [["Detail", "Value"]],
      body: [
        ["Storage date", formatDate(tire.storageDate) || "—"],
        ["Estimated retrieval", formatDate(tire.retrievalDate) || "—"],
        ["Notes", String(tire.notes || "—").slice(0, 80)],
      ],
    });

    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text("Customer signature", 14, y);
    doc.text("Staff signature", 110, y);
    doc.setDrawColor(...DOC_BRAND.muted);
    doc.line(14, y + 12, 90, y + 12);
    doc.line(110, y + 12, 186, y + 12);

    paintFooter(doc, `Tire hotel receipt ${tire.plateNumber || ""}`);
    doc.save(datedName("tire_hotel_receipt", "pdf"));
  };
  
  const getDashboardData = () => {
    const totalTires = hotelTires.length;
    const storedTires = hotelTires.filter(tire => !tire.retrieved).length;
    const retrievedTires = totalTires - storedTires;
    const expiredTires = hotelTires.filter(tire => 
      tire.retrievalDate && new Date(tire.retrievalDate) < new Date() && !tire.retrieved
    ).length;
  
    return [
      { name: 'In Storage', value: storedTires },
      { name: 'Delivered', value: retrievedTires },
      { name: 'Expired', value: expiredTires },
    ];
  };
  
  const getBrandDistribution = () => {
    const brandCounts = hotelTires.reduce((acc, tire) => {
      const brand = tire.brand || 'Unknown';
      acc[brand] = (acc[brand] || 0) + 1;
      return acc;
    }, {});
  
    return Object.entries(brandCounts).map(([brand, count]) => ({
      name: brand,
      value: count,
    }));
  };

  const getMonthlyStats = () => {
    const monthlyData = hotelTires.reduce((acc, tire) => {
      if (!tire.storageDate) return acc;
      const d = new Date(tire.storageDate);
      if (Number.isNaN(d.getTime())) return acc;
      const month = d.getMonth();
      acc[month] = (acc[month] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(monthlyData).map(([month, count]) => ({
      month: new Date(0, month).toLocaleString('default', { month: 'short' }),
      count: count,
    }));
  };

  const handleCustomerClick = (event, customer) => {
    setAnchorEl(event.currentTarget);
    setSelectedCustomer(customer);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleViewCustomerTires = () => {
    if (selectedCustomer) {
      setSearchTerm(selectedCustomer.name || '');
      setActiveTab(1);
      setSnackbar({ open: true, message: `Showing tires for ${selectedCustomer.name}`, severity: 'info' });
    }
    handleClose();
  };

  const openAddCustomer = () => {
    setEditingCustomer(null);
    setCustomerForm({ name: '', email: '', phone: '' });
    setIsCustomerDialogOpen(true);
  };

  const handleDeleteCustomer = () => {
    if (!selectedCustomer) {
      handleClose();
      return;
    }
    setConfirmDeleteOpen(true);
    handleClose();
  };

  const confirmDeleteCustomer = () => {
    if (selectedCustomer) {
      const cid = selectedCustomer.id;
      setCustomers((prev) => prev.filter((c) => String(c?.id) !== String(cid)));
      // Unlink (don't erase) tires of the deleted customer for the books.
      setHotelTires((prev) =>
        (prev || []).map((t) =>
          String(t?.customerId) === String(cid) ? { ...t, customerId: "" } : t
        )
      );
      deleteRow("hotelCustomers", cid);
      setSnackbar({ open: true, message: 'Customer deleted successfully', severity: 'success' });
    }
    setConfirmDeleteOpen(false);
    setSelectedCustomer(null);
  };

  const handleEditCustomer = () => {
    if (!selectedCustomer) {
      handleClose();
      return;
    }
    setEditingCustomer(selectedCustomer);
    setCustomerForm({
      name: selectedCustomer.name || '',
      email: selectedCustomer.email || '',
      phone: selectedCustomer.phone || '',
    });
    setIsCustomerDialogOpen(true);
    handleClose();
  };

  const handleSaveCustomer = (e) => {
    e.preventDefault();
    const name = (customerForm.name || '').trim();
    if (!name) {
      setSnackbar({ open: true, message: 'Customer name cannot be empty', severity: 'error' });
      return;
    }
    if (editingCustomer) {
      const updated = { ...editingCustomer, ...customerForm, name };
      setCustomers((prev) =>
        prev.map((c) => (String(c?.id) === String(editingCustomer.id) ? updated : c))
      );
      updateRow("hotelCustomers", editingCustomer.id, updated);
      setSnackbar({ open: true, message: 'Customer updated successfully', severity: 'success' });
    } else {
      const duplicate = customers.some(
        (c) => String(c?.name || "").trim().toLowerCase() === name.toLowerCase()
      );
      if (duplicate) {
        setSnackbar({ open: true, message: 'A customer with this name already exists', severity: 'error' });
        return;
      }
      const newCustomer = {
        id: newId(),
        ...customerForm,
        name,
      };
      setCustomers((prev) => [...prev, newCustomer]);
      insertRow("hotelCustomers", newCustomer).then((saved) => {
        if (saved && saved.id && String(saved.id) !== String(newCustomer.id)) {
          const savedId = saved.id;
          setCustomers((prev) =>
            (prev || []).map((c) =>
              String(c?.id) === String(newCustomer.id) ? { ...c, id: savedId } : c
            )
          );
        }
      });
      setSnackbar({ open: true, message: 'Customer added successfully', severity: 'success' });
    }
    setIsCustomerDialogOpen(false);
    setEditingCustomer(null);
    setCustomerForm({ name: '', email: '', phone: '' });
  };

  const handleExportTiresCSV = () => {
    downloadCsv(
      datedName("tire_hotel_report", "csv"),
      ['ID', 'Customer Name', 'Plate', 'Vehicle', 'Brand', 'Size', 'Quantity', 'Storage Date', 'Retrieval Date', 'Status', 'Notes'],
      hotelTires.map((t) => [
        t.id,
        t.customerName,
        t.plateNumber,
        t.vehicleModel,
        t.brand,
        t.size,
        t.quantity,
        t.storageDate || '',
        t.retrievalDate || '',
        t.retrieved ? 'Delivered' : 'In Storage',
        t.notes,
      ])
    );
    setSnackbar({ open: true, message: 'Tire report exported to CSV', severity: 'success' });
  };

  return (
    <ThemeProvider theme={extendAppTheme}>
      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ flexGrow: 1, padding: 3 }}>
          <Typography variant="h4" gutterBottom color="primary" sx={{ marginBottom: 3 }}>
            Tire Hotel
          </Typography>
          
          <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)} sx={{ marginBottom: 3 }}>
            <Tab label="Dashboard" icon={<DashboardIcon />} />
            <Tab label="Tire Management" icon={<InventoryIcon />} />
            <Tab label="Customer Management" icon={<PersonIcon />} />
            <Tab label="Calendar" icon={<CalendarMonthIcon />} />
            <Tab label="Reports" icon={<BarChartIcon />} />
          </Tabs>
  
          {activeTab === 0 && (
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>Tire Status</Typography>
                    <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={getDashboardData()}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {getDashboardData().map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip />
                    </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={6}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>Brand Distribution</Typography>
                    <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={getBrandDistribution()}
                      margin={{
                        top: 5,
                        right: 30,
                        left: 20,
                        bottom: 5,
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <RechartsTooltip />
                      <Legend />
                      <Bar dataKey="value" fill="#8884d8" />
                    </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>Monthly Statistics</Typography>
                    <ResponsiveContainer width="100%" height={300}>
                    <LineChart
                      data={getMonthlyStats()}
                      margin={{
                        top: 5,
                        right: 30,
                        left: 20,
                        bottom: 5,
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <RechartsTooltip />
                      <Legend />
                      <Line type="monotone" dataKey="count" stroke="#8884d8" activeDot={{ r: 8 }} />
                    </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>Quick Statistics</Typography>
                    <Grid container spacing={3}>
                      <Grid item xs={12} sm={3}>
                        <Paper elevation={3} sx={{ p: 2, textAlign: 'center' }}>
                          <Typography variant="h4">{hotelTires.length}</Typography>
                          <Typography variant="subtitle1">Total Tires</Typography>
                        </Paper>
                      </Grid>
                      <Grid item xs={12} sm={3}>
                        <Paper elevation={3} sx={{ p: 2, textAlign: 'center' }}>
                          <Typography variant="h4">
                            {hotelTires.filter(tire => !tire.retrieved).length}
                          </Typography>
                          <Typography variant="subtitle1">Tires in Storage</Typography>
                        </Paper>
                      </Grid>
                      <Grid item xs={12} sm={3}>
                        <Paper elevation={3} sx={{ p: 2, textAlign: 'center' }}>
                          <Typography variant="h4">
                            {hotelTires.filter(tire => 
                              tire.retrievalDate && new Date(tire.retrievalDate) < new Date() && !tire.retrieved
                            ).length}
                          </Typography>
                          <Typography variant="subtitle1">Expired Tires</Typography>
                        </Paper>
                      </Grid>
                      <Grid item xs={12} sm={3}>
                        <Paper elevation={3} sx={{ p: 2, textAlign: 'center' }}>
                          <Typography variant="h4">{customers.length}</Typography>
                          <Typography variant="subtitle1">Total Customers</Typography>
                        </Paper>
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          )}
  
  {activeTab === 1 && (
            <>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <TextField
                  label="Search"
                  variant="outlined"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon />
                      </InputAdornment>
                    ),
                  }}
                />
                <Box>
                  <Button
                    variant="contained"
                    startIcon={<InventoryIcon />}
                    onClick={() => setIsDialogOpen(true)}
                    sx={{ marginRight: 2 }}
                  >
                    Add New Tire
                  </Button>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={showExpiredOnly}
                        onChange={(e) => setShowExpiredOnly(e.target.checked)}
                        color="primary"
                      />
                    }
                    label="Show Expired Only"
                  />
                </Box>
              </Box>
              <StyledDataGrid
                rows={filteredTires}
                columns={columns}
                paginationModel={paginationModel}
                onPaginationModelChange={setPaginationModel}
                pageSizeOptions={[10, 25, 50]}
                disableRowSelectionOnClick
                slots={{
                  toolbar: GridToolbar,
                }}
              />
            </>
          )}

          {activeTab === 2 && (
            <>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                <Button variant="contained" onClick={openAddCustomer}>
                  Add Customer
                </Button>
              </Box>
            <Grid container spacing={3}>
              {customers.map((customer) => (
                <Grid item xs={12} sm={6} md={4} key={customer.id}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6">{customer.name}</Typography>
                      <Typography color="textSecondary">{customer.email}</Typography>
                      <Typography color="textSecondary">{customer.phone}</Typography>
                    </CardContent>
                    <CardActions>
                      <Button size="small" onClick={(event) => handleCustomerClick(event, customer)}>
                        Details
                      </Button>
                    </CardActions>
                  </Card>
                </Grid>
              ))}
              <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleClose}
              >
                <MenuItem onClick={handleEditCustomer}>Edit</MenuItem>
                <MenuItem onClick={handleDeleteCustomer}>Delete</MenuItem>
                <MenuItem onClick={handleViewCustomerTires}>View Tires</MenuItem>
              </Menu>
            </Grid>
            </>
          )}

          {activeTab === 3 && (
            <Calendar
              localizer={localizer}
              events={events}
              startAccessor="start"
              endAccessor="end"
              style={{ height: 500 }}
            />
          )}

          {activeTab === 4 && (
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Tire Hotel Reports</Typography>
                <Grid container spacing={2} sx={{ mb: 2 }}>
                  <Grid item xs={12} sm={6} md={3}>
                    <Paper elevation={2} sx={{ p: 2, textAlign: 'center' }}>
                      <Typography variant="h4">{hotelTires.length}</Typography>
                      <Typography variant="subtitle2">Total Tires</Typography>
                    </Paper>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Paper elevation={2} sx={{ p: 2, textAlign: 'center' }}>
                      <Typography variant="h4">{hotelTires.filter((t) => !t.retrieved).length}</Typography>
                      <Typography variant="subtitle2">In Storage</Typography>
                    </Paper>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Paper elevation={2} sx={{ p: 2, textAlign: 'center' }}>
                      <Typography variant="h4">{hotelTires.filter((t) => t.retrieved).length}</Typography>
                      <Typography variant="subtitle2">Delivered</Typography>
                    </Paper>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Paper elevation={2} sx={{ p: 2, textAlign: 'center' }}>
                      <Typography variant="h4">{hotelTires.filter((t) => t.retrievalDate && !Number.isNaN(new Date(t.retrievalDate).getTime()) && new Date(t.retrievalDate) < new Date() && !t.retrieved).length}</Typography>
                      <Typography variant="subtitle2">Expired</Typography>
                    </Paper>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Paper elevation={2} sx={{ p: 2, textAlign: 'center' }}>
                      <Typography variant="h4">{customers.length}</Typography>
                      <Typography variant="subtitle2">Total Customers</Typography>
                    </Paper>
                  </Grid>
                </Grid>
                <Button variant="contained" onClick={handleExportTiresCSV}>
                  Export Tires CSV
                </Button>
              </CardContent>
            </Card>
          )}
        </Box>

        <Dialog open={isDialogOpen} onClose={() => setIsDialogOpen(false)} maxWidth="md" fullWidth>
          <form onSubmit={handleSubmit}>
          <DialogTitle>{editingTire ? 'Edit Tire' : 'Add New Tire'}</DialogTitle>
          <DialogContent>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    name="customerName"
                    label="Customer Name"
                    value={newTire.customerName}
                    onChange={handleChange}
                    fullWidth
                    required
                    margin="normal"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    name="plateNumber"
                    label="License Plate"
                    value={newTire.plateNumber}
                    onChange={handleChange}
                    fullWidth
                    required
                    margin="normal"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    name="vehicleModel"
                    label="Vehicle Model"
                    value={newTire.vehicleModel}
                    onChange={handleChange}
                    fullWidth
                    margin="normal"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    name="brand"
                    label="Brand"
                    value={newTire.brand}
                    onChange={handleChange}
                    fullWidth
                    required
                    margin="normal"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    name="size"
                    label="Size"
                    value={newTire.size}
                    onChange={handleChange}
                    fullWidth
                    required
                    margin="normal"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    name="quantity"
                    label="Quantity"
                    type="number"
                    value={newTire.quantity}
                    onChange={handleChange}
                    fullWidth
                    required
                    margin="normal"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    name="storageDate"
                    label="Storage Date"
                    type="date"
                    value={newTire.storageDate}
                    onChange={handleChange}
                    fullWidth
                    required
                    margin="normal"
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    name="retrievalDate"
                    label="Estimated Retrieval Date"
                    type="date"
                    value={newTire.retrievalDate}
                    onChange={handleChange}
                    fullWidth
                    margin="normal"
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    name="notes"
                    label="Notes"
                    value={newTire.notes}
                    onChange={handleChange}
                    fullWidth
                    multiline
                    rows={4}
                    margin="normal"
                  />
                </Grid>
                <Grid item xs={12}>
                  <input
                    accept="image/*"
                    style={{ display: 'none' }}
                    id="raised-button-file"
                    type="file"
                    onChange={handlePhotoChange}
                  />
                  <label htmlFor="raised-button-file">
                    <Button variant="outlined" component="span" startIcon={<PhotoCamera />}>
                      Upload Photo
                    </Button>
                  </label>
                  {newTire.photo && (
                    <TireImage src={newTire.photo} alt="Tire photo" />
                  )}
                </Grid>
              </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setIsDialogOpen(false)} disabled={isSaving}>Cancel</Button>
            <Button type="submit" variant="contained" color="primary" disabled={isSaving} startIcon={isSaving ? <CircularProgress size={20} color="inherit" /> : null}>
              {isSaving ? 'Saving...' : (editingTire ? 'Update' : 'Add')}
            </Button>
          </DialogActions>
          </form>
        </Dialog>

        <Dialog open={isCustomerDialogOpen} onClose={() => setIsCustomerDialogOpen(false)} maxWidth="sm" fullWidth>
          <form onSubmit={handleSaveCustomer}>
            <DialogTitle>{editingCustomer ? 'Edit Customer' : 'Add Customer'}</DialogTitle>
            <DialogContent>
              <Grid container spacing={2} sx={{ mt: 1 }}>
                <Grid item xs={12}>
                  <TextField
                    label="Full Name"
                    value={customerForm.name}
                    onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                    fullWidth
                    required
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Email"
                    type="email"
                    value={customerForm.email}
                    onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Phone"
                    value={customerForm.phone}
                    onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                    fullWidth
                  />
                </Grid>
              </Grid>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setIsCustomerDialogOpen(false)}>Cancel</Button>
              <Button type="submit" variant="contained">{editingCustomer ? 'Update' : 'Add'}</Button>
            </DialogActions>
          </form>
        </Dialog>

        <Dialog open={confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle>Delete customer?</DialogTitle>
          <DialogContent>
            <Typography variant="body2">
              {selectedCustomer ? `Delete customer "${selectedCustomer.name}"? This cannot be undone.` : 'Delete this customer?'}
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmDeleteOpen(false)}>Cancel</Button>
            <Button onClick={confirmDeleteCustomer} color="error" variant="contained">Delete</Button>
          </DialogActions>
        </Dialog>

        <SuccessModal
          open={successModal.open}
          onClose={() => setSuccessModal({ ...successModal, open: false })}
          title={successModal.title}
          message={successModal.message}
          details={successModal.details}
          actionLabel="Done"
        />
        <Snackbar
          open={snackbar.open}
          autoHideDuration={6000}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
        >
          <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity}>
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Box>
    </ThemeProvider>
  );
}

export default TireHotel;