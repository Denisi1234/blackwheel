import React, { useState, useEffect, useRef } from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Grid,
  Card,
  CardContent,
  CardActions,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  Alert,
  Tabs,
  Tab,
  Paper,
  Chip,
  Tooltip,
  Switch,
  FormControlLabel,
  CircularProgress,
} from "@mui/material";
import SuccessModal from "./SuccessModal";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import {
  LocalizationProvider,
  DatePicker,
  TimePicker,
} from "@mui/x-date-pickers";
import {
  Edit,
  Delete,
  CheckCircle,
  EventNote,
  PictureAsPdf,
  Email,
  Notifications,
  CalendarToday,
  AccessTime,
  Person,
  Phone,
  Note,
} from "@mui/icons-material";
import { jsPDF } from "jspdf";
import "jspdf-autotable";
import {
  paintHeader,
  paintFooter,
  moneyTable,
  sectionCaption,
  datedName,
} from "../lib/documents";
import { Calendar, momentLocalizer } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";
import {
  loadTable,
  insertRow,
  updateRow,
  deleteRow,
  newId,
} from "../lib/store";

const localizer = momentLocalizer(moment);

const services = [
  "Tire Change",
  "Wheel Balancing",
  "Wheel Alignment",
  "Brake Service",
  "Oil Change",
  "General Maintenance",
];

const AppointmentSystem = () => {
  const safeParseDate = (v) => {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    return d && !Number.isNaN(d.getTime()) ? d : null;
  };
  const formatDateSafe = (v) => {
    const d = safeParseDate(v);
    return d ? d.toLocaleDateString() : '-';
  };
  const formatTimeSafe = (v) => {
    const d = safeParseDate(v);
    return d ? d.toLocaleTimeString() : '-';
  };
  const [appointments, setAppointments] = useState([]);
  const [formData, setFormData] = useState({
    customerName: "",
    phoneNumber: "",
    email: "",
    service: "",
    date: null,
    time: null,
    notes: "",
    sendReminder: false,
  });
  const [editingId, setEditingId] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "success",
  });
  const [tabValue, setTabValue] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [successModal, setSuccessModal] = useState({ open: false, title: '', message: '', details: [] });
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const loadedRef = useRef(false);

  // Supabase-first; localStorage fallback keeps bookings working offline.
  useEffect(() => {
    const loadAll = async () => {
      try {
        const remote = await loadTable("appointments");
        if (remote !== null) {
          setAppointments(remote);
        } else {
          const storedAppointments = localStorage.getItem("appointments");
          if (storedAppointments) {
            const parsed = JSON.parse(storedAppointments);
            if (Array.isArray(parsed)) setAppointments(parsed);
          }
        }
      } catch (e) {
        // ignore corrupt storage
      } finally {
        loadedRef.current = true;
      }
    };
    loadAll();
  }, []);

  useEffect(() => {
    if (!loadedRef.current) return;
    try {
      localStorage.setItem("appointments", JSON.stringify(appointments));
    } catch (e) {
      // storage unavailable
    }
  }, [appointments]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleDateChange = (date) => {
    setFormData({ ...formData, date });
  };

  const handleTimeChange = (time) => {
    setFormData({ ...formData, time });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.date || !formData.time) {
      showSnackbar("Please select both date and time.", "error");
      return;
    }
    const dateObj = safeParseDate(formData.date);
    const timeObj = safeParseDate(formData.time);
    if (!dateObj || !timeObj) {
      showSnackbar("Invalid date or time value.", "error");
      return;
    }
    const normalizedDate = dateObj.toISOString();
    const normalizedTime = timeObj.toISOString();
    // Overlap check: same calendar day + same hour:minute + same service
    const dayKey = dateObj.toDateString();
    const timeKey = `${timeObj.getHours()}:${timeObj.getMinutes()}`;
    const isOverlap = appointments.some((app) => {
      if (editingId && String(app?.id) === String(editingId)) return false;
      const appDate = safeParseDate(app.date);
      const appTime = safeParseDate(app.time);
      if (!appDate || !appTime) return false;
      return (
        app.service === formData.service &&
        appDate.toDateString() === dayKey &&
        `${appTime.getHours()}:${appTime.getMinutes()}` === timeKey
      );
    });
    if (isOverlap) {
      showSnackbar("Overlapping appointment: same date, time and service already exists.", "error");
      return;
    }
    // Past-date warning
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const apptDay = new Date(dateObj);
    apptDay.setHours(0, 0, 0, 0);
    const isPast = apptDay < today;
    const payload = { ...formData, date: normalizedDate, time: normalizedTime };
    const isEdit = Boolean(editingId);
    const snapshot = { ...payload };
    setIsSaving(true);
    setTimeout(() => {
      if (isEdit) {
        const updated = { ...payload, status: "Updated" };
        setAppointments((prev) =>
          (prev || []).map((app) =>
            String(app?.id) === String(editingId) ? { ...app, ...updated } : app
          )
        );
        updateRow("appointments", editingId, updated);
        setEditingId(null);
        showSnackbar(
          isPast ? "Appointment updated, but date is in the past." : "Appointment updated successfully",
          isPast ? "warning" : "success"
        );
      } else {
        const newAppointment = {
          id: newId(),
          ...payload,
          status: "New",
        };
        setAppointments((prev) => [...(prev || []), newAppointment]);
        insertRow("appointments", newAppointment).then((saved) => {
          if (saved && saved.id && String(saved.id) !== String(newAppointment.id)) {
            const savedId = saved.id;
            setAppointments((prev) =>
              (prev || []).map((app) =>
                String(app?.id) === String(newAppointment.id)
                  ? { ...app, id: savedId }
                  : app
              )
            );
          }
        });
        showSnackbar(
          isPast ? "New appointment added, but date is in the past." : "New appointment added successfully",
          isPast ? "warning" : "success"
        );
      }
      setSuccessModal({
        open: true,
        title: isEdit ? "Appointment Updated" : "Appointment Added",
        message: isEdit
          ? "The appointment has been updated successfully."
          : "The new appointment has been added successfully.",
        details: [
          { label: "Customer", value: snapshot.customerName || "-" },
          { label: "Service", value: snapshot.service || "-" },
          { label: "Date", value: dateObj.toLocaleDateString() },
          { label: "Time", value: timeObj.toLocaleTimeString() },
        ],
      });
      setIsSaving(false);
      setFormData({
        customerName: "",
        phoneNumber: "",
        email: "",
        service: "",
        date: null,
        time: null,
        notes: "",
        sendReminder: false,
      });
    }, 600);
  };

  const handleEdit = (appointment) => {
    setFormData({
      ...appointment,
      date: safeParseDate(appointment.date),
      time: safeParseDate(appointment.time),
    });
    setEditingId(appointment.id);
    setTabValue(0);
  };

  const handleDelete = (id) => {
    setConfirmDeleteId(id);
  };

  const confirmDelete = () => {
    if (confirmDeleteId !== null) {
      setAppointments((prev) =>
        (prev || []).filter((app) => String(app?.id) !== String(confirmDeleteId))
      );
      deleteRow("appointments", confirmDeleteId);
      showSnackbar("Appointment deleted", "info");
    }
    setConfirmDeleteId(null);
  };

  const handleComplete = (id) => {
    setAppointments((prev) =>
      (prev || []).map((app) =>
        String(app?.id) === String(id) ? { ...app, status: "Completed" } : app
      )
    );
    updateRow("appointments", id, { status: "Completed" });
    showSnackbar("Appointment marked as completed", "success");
  };

  const handleOpenDialog = (appointment) => {
    setSelectedAppointment(appointment);
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
  };

  const handleStatusFilterChange = (e) => {
    setFilterStatus(e.target.value);
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

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const filteredAppointments = filterStatus
    ? appointments.filter((app) => app.status === filterStatus)
    : appointments;

  const exportToPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    const startY = paintHeader(doc, { title: "Appointments" });
    sectionCaption(doc, `Schedule report — ${filteredAppointments.length} appointment(s)`, startY);
    moneyTable(doc, {
      startY: startY + 8,
      head: [
        [
          "Customer Name",
          "Phone",
          "Email",
          "Service",
          "Date",
          "Time",
          "Status",
        ],
      ],
      body:
        filteredAppointments.length > 0
          ? filteredAppointments.map((app) => [
              String(app.customerName || "—").slice(0, 28),
              String(app.phoneNumber || "—").slice(0, 20),
              String(app.email || "—").slice(0, 30),
              String(app.service || "—").slice(0, 26),
              formatDateSafe(app.date),
              formatTimeSafe(app.time),
              app.status || "—",
            ])
          : [["—", "", "", "No appointments", "", "", ""]],
    });
    paintFooter(doc, "Appointment schedule");
    doc.save(datedName("appointments", "pdf"));
  };

  const sendReminderEmail = async (appointment) => {
    const serviceId = process.env.REACT_APP_EMAILJS_SERVICE_ID;
    const templateId = process.env.REACT_APP_EMAILJS_TEMPLATE_ID;
    const userId = process.env.REACT_APP_EMAILJS_USER_ID;
    if (!serviceId || !templateId || !userId) {
      showSnackbar(
        `Reminder for ${appointment.email} saved (email service not configured - set REACT_APP_EMAILJS_* in .env).`,
        "info"
      );
      return;
    }
    try {
      const emailjs = await import("emailjs-com");
      const send = emailjs.send || (emailjs.default && emailjs.default.send);
      await send(serviceId, templateId, { ...appointment }, userId);
      showSnackbar(`Reminder email sent: ${appointment.email}`, "success");
    } catch (e) {
      console.error("Reminder email failed:", e);
      showSnackbar(`Failed to send reminder to ${appointment.email}`, "error");
    }
  };

  const buildEventStart = (app) => {
    const d = safeParseDate(app.date);
    if (!d) return null;
    const t = safeParseDate(app.time);
    const start = new Date(d);
    if (t) start.setHours(t.getHours(), t.getMinutes(), 0, 0);
    return Number.isNaN(start.getTime()) ? null : start;
  };

  const calendarEvents = appointments
    .map((app) => {
      const start = buildEventStart(app);
      if (!start) return null;
      return {
        id: app.id,
        title: `${app.customerName} - ${app.service}`,
        start,
        end: moment(start).add(1, "hours").toDate(),
        resource: app,
      };
    })
    .filter(Boolean);

  return (
    <Box sx={{ maxWidth: 1200, margin: "auto", padding: 2 }}>
      <Typography
        variant="h4"
        gutterBottom
        sx={{
          textAlign: "center",
          mb: 4,
          fontWeight: "bold",
          color: "#1976d2",
        }}
      >
        Corporate Appointment Management System
      </Typography>

      <Paper elevation={3} sx={{ mb: 4 }}>
        <Tabs value={tabValue} onChange={handleTabChange} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile>
          <Tab label="Add/Edit Appointment" />
          <Tab label="Appointment List" />
          <Tab label="Calendar View" />
        </Tabs>
      </Paper>

      {tabValue === 0 && (
        <Paper elevation={3} sx={{ p: 3 }}>
          <form onSubmit={handleSubmit}>
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Customer Name"
                  name="customerName"
                  value={formData.customerName}
                  onChange={handleInputChange}
                  fullWidth
                  required
                  InputProps={{
                    startAdornment: <Person color="action" />,
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Phone Number"
                  name="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={handleInputChange}
                  fullWidth
                  required
                  InputProps={{
                    startAdornment: <Phone color="action" />,
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  fullWidth
                  required
                  InputProps={{
                    startAdornment: <Email color="action" />,
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth required>
                  <InputLabel>Service</InputLabel>
                  <Select
                    name="service"
                    value={formData.service}
                    onChange={handleInputChange}
                  >
                    {services.map((service) => (
                      <MenuItem key={service} value={service}>
                        {service}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <LocalizationProvider dateAdapter={AdapterDateFns}>
                  <DatePicker
                    label="Date"
                    value={formData.date}
                    onChange={handleDateChange}
                    slotProps={{ textField: { fullWidth: true, required: true } }}
                  />
                </LocalizationProvider>
              </Grid>
              <Grid item xs={12} sm={6}>
                <LocalizationProvider dateAdapter={AdapterDateFns}>
                  <TimePicker
                    label="Time"
                    value={formData.time}
                    onChange={handleTimeChange}
                    slotProps={{ textField: { fullWidth: true, required: true } }}
                  />
                </LocalizationProvider>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Notes"
                  name="notes"
                  value={formData.notes}
                  onChange={handleInputChange}
                  fullWidth
                  multiline
                  rows={4}
                  InputProps={{
                    startAdornment: <Note color="action" />,
                  }}
                />
              </Grid>
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.sendReminder}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          sendReminder: e.target.checked,
                        })
                      }
                      name="sendReminder"
                      color="primary"
                    />
                  }
                  label="Send Reminder Email"
                />
              </Grid>
              <Grid item xs={12}>
                <Button
                  type="submit"
                  variant="contained"
                  color="primary"
                  fullWidth
                  disabled={isSaving}
                  startIcon={isSaving ? <CircularProgress size={20} color="inherit" /> : null}
                >
                  {isSaving ? "Saving..." : (editingId ? "Update Appointment" : "Add Appointment")}
                </Button>
              </Grid>
            </Grid>
          </form>
        </Paper>
      )}

      {tabValue === 1 && (
        <Paper elevation={3} sx={{ p: 3 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 2, mb: 3 }}>
            <FormControl sx={{ minWidth: 200, flexGrow: 1, maxWidth: { xs: "100%", sm: 300 } }}>
              <InputLabel>Filter by Status</InputLabel>
              <Select value={filterStatus} onChange={handleStatusFilterChange}>
                <MenuItem value="">All</MenuItem>
                <MenuItem value="New">New</MenuItem>
                <MenuItem value="Updated">Updated</MenuItem>
                <MenuItem value="Completed">Completed</MenuItem>
              </Select>
            </FormControl>
            <Button
              variant="contained"
              color="secondary"
              onClick={exportToPDF}
              startIcon={<PictureAsPdf />}
            >
              Download PDF
            </Button>
          </Box>

          <Grid container spacing={3}>
            {filteredAppointments.map((appointment) => (
              <Grid item xs={12} sm={6} md={4} key={appointment.id}>
                <Card
                  raised
                  sx={{
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    bgcolor: "background.paper",
                    color: "text.primary",
                    borderLeft: 6,
                    borderColor:
                      appointment.status === "Completed"
                        ? "#4caf50"
                        : appointment.status === "Updated"
                        ? "#ff9800"
                        : "#2196f3",
                    transition:
                      "transform 0.3s ease-in-out, box-shadow 0.3s ease-in-out",
                    "&:hover": {
                      transform: "translateY(-5px)",
                      boxShadow: "0 8px 16px 0 rgba(0,0,0,0.2)",
                    },
                  }}
                >
                  <CardContent sx={{ flexGrow: 1 }}>
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        mb: 2,
                      }}
                    >
                      <Typography
                        variant="h6"
                        sx={{ fontWeight: "bold", color: "text.primary" }}
                      >
                        {appointment.customerName}
                      </Typography>
                      <Chip
                        label={appointment.status}
                        color={
                          appointment.status === "Completed"
                            ? "success"
                            : appointment.status === "Updated"
                            ? "warning"
                            : "info"
                        }
                        size="small"
                      />
                    </Box>
                    <Typography
                      variant="body2"
                      color="textSecondary"
                      sx={{ display: "flex", alignItems: "center", mb: 1 }}
                    >
                      <Phone
                        fontSize="small"
                        sx={{ mr: 1, color: "#757575" }}
                      />{" "}
                      {appointment.phoneNumber}
                    </Typography>
                    <Typography
                      variant="body2"
                      color="textSecondary"
                      sx={{ display: "flex", alignItems: "center", mb: 1 }}
                    >
                      <Email
                        fontSize="small"
                        sx={{ mr: 1, color: "#757575" }}
                      />{" "}
                      {appointment.email}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        mb: 1,
                        color: "#1976d2",
                        fontWeight: "medium",
                      }}
                    >
                      <EventNote fontSize="small" sx={{ mr: 1 }} />{" "}
                      {appointment.service}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ display: "flex", alignItems: "center", mb: 1 }}
                    >
                      <CalendarToday
                        fontSize="small"
                        sx={{ mr: 1, color: "#757575" }}
                      />
                      {formatDateSafe(appointment.date)}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ display: "flex", alignItems: "center", mb: 1 }}
                    >
                      <AccessTime
                        fontSize="small"
                        sx={{ mr: 1, color: "#757575" }}
                      />
                      {formatTimeSafe(appointment.time)}
                    </Typography>
                    {appointment.notes && (
                      <Typography
                        variant="body2"
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          mb: 1,
                          fontStyle: "italic",
                          color: "text.secondary",
                        }}
                      >
                        <Note fontSize="small" sx={{ mr: 1 }} />
                        {appointment.notes}
                      </Typography>
                    )}
                  </CardContent>
                  <CardActions
                    sx={{
                      justifyContent: "space-between",
                      bgcolor: "action.hover",
                      borderTop: "1px solid",
                      borderColor: "divider",
                    }}
                  >
                    <Box>
                      <Tooltip title="Edit">
                        <IconButton
                          onClick={() => handleEdit(appointment)}
                          size="small"
                        >
                          <Edit fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Mark as completed">
                        <IconButton
                          onClick={() => handleComplete(appointment.id)}
                          size="small"
                        >
                          <CheckCircle fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton
                          onClick={() => handleDelete(appointment.id)}
                          size="small"
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                    <Box>
                      <Tooltip title="Details">
                        <IconButton
                          onClick={() => handleOpenDialog(appointment)}
                          size="small"
                        >
                          <EventNote fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {appointment.sendReminder && (
                        <Tooltip title="Send Reminder Email">
                          <IconButton
                            onClick={() => sendReminderEmail(appointment)}
                            size="small"
                          >
                            <Notifications fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Paper>
      )}

      {tabValue === 2 && (
        <Paper elevation={3} sx={{ p: 3, height: 600 }}>
          <Calendar
            localizer={localizer}
            events={calendarEvents}
            startAccessor="start"
            endAccessor="end"
            style={{ height: "100%" }}
            onSelectEvent={(event) => handleOpenDialog(event.resource)}
          />
        </Paper>
      )}

      <Dialog
        open={confirmDeleteId !== null}
        onClose={() => setConfirmDeleteId(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete appointment?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">This cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
          <Button onClick={confirmDelete} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={openDialog}
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Appointment Details</DialogTitle>
        <DialogContent>
          {selectedAppointment && (
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Typography variant="h6">
                  {selectedAppointment.customerName}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography>
                  <strong>Phone:</strong> {selectedAppointment.phoneNumber}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography>
                  <strong>Email:</strong> {selectedAppointment.email}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography>
                  <strong>Service:</strong> {selectedAppointment.service}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography>
                  <strong>Date:</strong>{" "}
                  {formatDateSafe(selectedAppointment.date)}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography>
                  <strong>Time:</strong>{" "}
                  {formatTimeSafe(selectedAppointment.time)}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography>
                  <strong>Status:</strong> {selectedAppointment.status}
                </Typography>
              </Grid>
              <Grid item xs={12}>
                <Typography>
                  <strong>Notes:</strong> {selectedAppointment.notes}
                </Typography>
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Close</Button>
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
        onClose={handleCloseSnackbar}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity={snackbar.severity}
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default AppointmentSystem;