import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
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
  Paper,
  Chip,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Avatar,
  LinearProgress,
  Divider,
  InputAdornment,
} from "@mui/material";
import {
  Add,
  Edit,
  Delete,
  CheckCircle,
  Cancel,
  Replay,
  Search,
  Download,
  Person,
  Assignment,
} from "@mui/icons-material";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { LocalizationProvider, DatePicker, TimePicker } from "@mui/x-date-pickers";
import { format, isToday, isBefore, startOfDay } from "date-fns";
import { jsPDF } from "jspdf";
import "jspdf-autotable";
import SuccessModal from "./SuccessModal";
import { downloadCsv, datedName, paintHeader, paintFooter, moneyTable, fmtDate } from "../lib/documents";
import { loadTable, insertRow, updateRow, deleteRow, newId, isUuid, isSupabaseConfigured } from "../lib/store";
import { getWorkerPermissions } from "../lib/team";

const TASK_TYPES = ["Removal", "Fitting", "Repair", "Maintenance", "Inspection"];
const STATUSES = ["In Progress", "Completed", "Cancelled"];

const statusColor = (s) => {
  if (s === "Completed") return "success";
  if (s === "Cancelled") return "error";
  return "primary";
};

const safeDate = (v) => {
  if (!v) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const toDateStr = (d) => {
  const dt = safeDate(d);
  if (!dt) return "";
  try {
    return format(dt, "yyyy-MM-dd");
  } catch (e) {
    return "";
  }
};

const toTimeStr = (t) => {
  const dt = safeDate(t);
  if (!dt) {
    const m = String(t || "").match(/(\d{1,2}):(\d{2})/);
    return m ? `${String(m[1]).padStart(2, "0")}:${m[2]}` : "";
  }
  try {
    return format(dt, "HH:mm");
  } catch (e) {
    return "";
  }
};

const timeStrToDate = (timeStr, baseDate) => {
  const base = safeDate(baseDate) || new Date();
  const m = String(timeStr || "").match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const d = new Date(base);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d;
};

const WorkerTracking = ({ user = null, shop = null }) => {
  // ---- Role-based access (same pattern as TeamManagement / CurrentAccount) ----
  // Central matrix lives in lib/team.getWorkerPermissions (unit-tested).
  const role = shop?.role || user?.role || "Staff";
  const {
    isTechnician,
    canManageWorkers,
    canAssignTasks,
    canEditTasks,
    canChangeStatus,
    canDeleteTasks,
    readOnly,
  } = getWorkerPermissions(role, isSupabaseConfigured());
  void isTechnician;

  const [workers, setWorkers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [workerFilter, setWorkerFilter] = useState("All");
  const [dateFilter, setDateFilter] = useState("All");

  const [workerDialog, setWorkerDialog] = useState(false);
  const [editingWorker, setEditingWorker] = useState(null);
  const [workerForm, setWorkerForm] = useState({ name: "", position: "", contact: "" });

  const [taskDialog, setTaskDialog] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [taskForm, setTaskForm] = useState({
    workerId: "",
    task: TASK_TYPES[0],
    date: new Date(),
    time: new Date(),
    details: "",
    status: "In Progress",
  });

  const [confirmDeleteWorker, setConfirmDeleteWorker] = useState(null);
  const [confirmDeleteTask, setConfirmDeleteTask] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });
  const [successModal, setSuccessModal] = useState({ open: false, title: "", message: "", details: [] });
  const loadedRef = useRef(false);

  const showSnackbar = (message, severity = "success") => setSnackbar({ open: true, message, severity });

  // ---- Load: pure cloud ----
  useEffect(() => {
    const loadAll = async () => {
      try {
        const [remoteWorkers, remoteTasks] = await Promise.all([loadTable("workers"), loadTable("tasks")]);
        if (remoteWorkers !== null && remoteTasks !== null) {
          setWorkers(Array.isArray(remoteWorkers) ? remoteWorkers : []);
          setTasks(Array.isArray(remoteTasks) ? remoteTasks : []);
        } else {
          setWorkers([]);
          setTasks([]);
        }
      } catch (e) {
        setWorkers([]);
        setTasks([]);
      } finally {
        loadedRef.current = true;
      }
    };
    loadAll();
  }, []);

  const workerById = (id) => (workers || []).find((w) => String(w?.id) === String(id));

  const getWorkerStats = (workerId) => {
    const list = (tasks || []).filter((t) => String(t?.workerId) === String(workerId));
    const completed = list.filter((t) => t.status === "Completed").length;
    const total = list.length;
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, total, rate, inProgress: list.filter((t) => t.status === "In Progress").length };
  };

  const stats = useMemo(() => {
    const totalWorkers = (workers || []).length;
    const totalTasks = (tasks || []).length;
    const completed = (tasks || []).filter((t) => t.status === "Completed").length;
    const inProgress = (tasks || []).filter((t) => t.status === "In Progress").length;
    const today = startOfDay(new Date());
    const overdue = (tasks || []).filter((t) => {
      if (t.status !== "In Progress") return false;
      const d = safeDate(t.date);
      return d && isBefore(startOfDay(d), today);
    }).length;
    return { totalWorkers, totalTasks, completed, inProgress, overdue };
  }, [workers, tasks]);

  const filteredTasks = useMemo(() => {
    let list = [...(tasks || [])];
    const term = searchText.trim().toLowerCase();
    if (term) {
      list = list.filter((t) => {
        const wName = (workerById(t.workerId)?.name || "").toLowerCase();
        return (
          String(t.task || "").toLowerCase().includes(term) ||
          wName.includes(term) ||
          String(t.details || "").toLowerCase().includes(term)
        );
      });
    }
    if (statusFilter !== "All") list = list.filter((t) => t.status === statusFilter);
    if (workerFilter !== "All") list = list.filter((t) => String(t.workerId) === String(workerFilter));
    if (dateFilter !== "All") {
      list = list.filter((t) => {
        const d = safeDate(t.date);
        if (!d) return false;
        if (dateFilter === "Today") return isToday(d);
        if (dateFilter === "Overdue") return t.status === "In Progress" && isBefore(startOfDay(d), startOfDay(new Date()));
        if (dateFilter === "Upcoming") return t.status === "In Progress" && !isBefore(startOfDay(d), startOfDay(new Date()));
        return true;
      });
    }
    list.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.time || "").localeCompare(String(a.time || "")));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, workers, searchText, statusFilter, workerFilter, dateFilter]);

  useEffect(() => {
    setPage(0);
  }, [searchText, statusFilter, workerFilter, dateFilter]);

  const pagedTasks = useMemo(() => {
    const start = page * rowsPerPage;
    return filteredTasks.slice(start, start + rowsPerPage);
  }, [filteredTasks, page, rowsPerPage]);

  // ---- Workers ----
  const openAddWorker = () => {
    if (!canManageWorkers) {
      showSnackbar("Only Admin can manage workers.", "error");
      return;
    }
    setEditingWorker(null);
    setWorkerForm({ name: "", position: "", contact: "" });
    setWorkerDialog(true);
  };

  const openEditWorker = (w) => {
    if (!canManageWorkers) {
      showSnackbar("Only Admin can manage workers.", "error");
      return;
    }
    setEditingWorker(w);
    setWorkerForm({ name: w.name || "", position: w.position || "", contact: w.contact || "" });
    setWorkerDialog(true);
  };

  const saveWorker = () => {
    if (!canManageWorkers) {
      showSnackbar("Only Admin can manage workers.", "error");
      return;
    }
    const name = workerForm.name.trim();
    const position = workerForm.position.trim();
    const contact = workerForm.contact.trim();
    if (!name || !position || !contact) {
      showSnackbar("Please fill name, position and contact.", "error");
      return;
    }
    if (editingWorker) {
      const patch = { name, position, contact };
      setWorkers((prev) => (prev || []).map((w) => (String(w?.id) === String(editingWorker.id) ? { ...w, ...patch } : w)));
      updateRow("workers", editingWorker.id, patch);
      showSnackbar("Worker updated.", "success");
      setSuccessModal({ open: true, title: "Worker Updated", message: "Worker information updated.", details: [{ label: "Name", value: name }, { label: "Position", value: position }] });
    } else {
      const rec = { id: newId(), name, position, contact };
      setWorkers((prev) => [...(prev || []), rec]);
      insertRow("workers", rec);
      showSnackbar("Worker added.", "success");
      setSuccessModal({ open: true, title: "Worker Added", message: "New worker added.", details: [{ label: "Name", value: name }, { label: "Position", value: position }] });
    }
    setWorkerDialog(false);
  };

  const deleteWorker = (id) => {
    if (!canManageWorkers) {
      showSnackbar("Only Admin can delete workers.", "error");
      return;
    }
    setWorkers((prev) => (prev || []).filter((w) => String(w?.id) !== String(id)));
    setTasks((prev) => (prev || []).filter((t) => String(t?.workerId) !== String(id)));
    deleteRow("workers", id);
    // Remote tasks cascade via FK; local rows already removed above.
    setConfirmDeleteWorker(null);
    showSnackbar("Worker and their tasks deleted.", "success");
  };

  // ---- Tasks ----
  const openAddTask = (worker) => {
    if (!canAssignTasks) {
      showSnackbar("Only Admin or Technician can assign tasks.", "error");
      return;
    }
    const wid = worker?.id || (workers[0]?.id) || "";
    if (!wid) {
      showSnackbar("Add a worker first.", "error");
      return;
    }
    setEditingTask(null);
    setTaskForm({ workerId: String(wid), task: TASK_TYPES[0], date: new Date(), time: new Date(), details: "", status: "In Progress" });
    setTaskDialog(true);
  };

  const openEditTask = (t) => {
    if (!canEditTasks) {
      showSnackbar("Only Admin or Technician can edit tasks.", "error");
      return;
    }
    setEditingTask(t);
    setTaskForm({
      workerId: String(t.workerId || ""),
      task: TASK_TYPES.includes(t.task) ? t.task : TASK_TYPES[0],
      date: safeDate(t.date) || new Date(),
      time: timeStrToDate(t.time, t.date) || new Date(),
      details: t.details || "",
      status: STATUSES.includes(t.status) ? t.status : "In Progress",
    });
    setTaskDialog(true);
  };

  const saveTask = () => {
    if (!canAssignTasks && !editingTask) {
      showSnackbar("Only Admin or Technician can assign tasks.", "error");
      return;
    }
    if (editingTask && !canEditTasks) {
      showSnackbar("Only Admin or Technician can edit tasks.", "error");
      return;
    }
    if (!taskForm.workerId || !workerById(taskForm.workerId)) {
      showSnackbar("Select a valid worker.", "error");
      return;
    }
    const dateStr = toDateStr(taskForm.date);
    const timeStr = toTimeStr(taskForm.time);
    if (!dateStr) {
      showSnackbar("Select a valid date.", "error");
      return;
    }
    if (!timeStr) {
      showSnackbar("Select a valid time.", "error");
      return;
    }
    if (editingTask) {
      const patch = {
        workerId: taskForm.workerId,
        task: taskForm.task,
        date: dateStr,
        time: timeStr,
        details: taskForm.details.trim(),
        status: taskForm.status,
        ...(taskForm.status === "Completed" && editingTask.status !== "Completed"
          ? { completionTime: new Date().toISOString() }
          : {}),
        ...(taskForm.status !== "Completed" ? { completionTime: "" } : {}),
      };
      setTasks((prev) => (prev || []).map((t) => (String(t?.id) === String(editingTask.id) ? { ...t, ...patch } : t)));
      updateRow("tasks", editingTask.id, patch);
      showSnackbar("Task updated.", "success");
    } else {
      const rec = {
        id: newId(),
        workerId: taskForm.workerId,
        task: taskForm.task,
        date: dateStr,
        time: timeStr,
        details: taskForm.details.trim(),
        status: "In Progress",
        completionTime: "",
      };
      setTasks((prev) => [...(prev || []), rec]);
      if (isUuid(taskForm.workerId) && isUuid(rec.id)) insertRow("tasks", rec);
      showSnackbar("Task assigned.", "success");
      setSuccessModal({
        open: true,
        title: "Task Assigned",
        message: "New task assigned successfully.",
        details: [
          { label: "Worker", value: workerById(rec.workerId)?.name || "-" },
          { label: "Task", value: rec.task },
          { label: "Date", value: rec.date },
        ],
      });
    }
    setTaskDialog(false);
  };

  const setTaskStatus = (id, status) => {
    if (!canChangeStatus) {
      showSnackbar("Only Admin or Technician can update task status.", "error");
      return;
    }
    const patch = { status };
    if (status === "Completed") patch.completionTime = new Date().toISOString();
    else patch.completionTime = "";
    setTasks((prev) => (prev || []).map((t) => (String(t?.id) === String(id) ? { ...t, ...patch } : t)));
    updateRow("tasks", id, patch);
    showSnackbar(status === "Completed" ? "Task completed." : status === "Cancelled" ? "Task cancelled." : "Task reopened.", "success");
  };

  const deleteTask = (id) => {
    if (!canDeleteTasks) {
      showSnackbar("Only Admin can delete tasks.", "error");
      return;
    }
    setTasks((prev) => (prev || []).filter((t) => String(t?.id) !== String(id)));
    deleteRow("tasks", id);
    setConfirmDeleteTask(null);
    showSnackbar("Task deleted.", "success");
  };

  // ---- Exports ----
  const exportCSV = () => {
    const header = ["Worker", "Task", "Date", "Time", "Status", "Details"];
    const lines = filteredTasks.map((t) => [workerById(t.workerId)?.name || "", t.task || "", t.date || "", t.time || "", t.status || "", t.details || ""]);
    downloadCsv(datedName("worker_tasks", "csv"), header, lines);
    showSnackbar("Tasks exported to CSV.", "success");
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    const y0 = paintHeader(doc, { title: "Worker Tasks", refNo: `${filteredTasks.length} tasks` });
    const rows = filteredTasks.map((t) => [
      String(workerById(t.workerId)?.name || "-").slice(0, 22),
      String(t.task || "-").slice(0, 18),
      fmtDate(t.date),
      String(t.time || "-").slice(0, 5),
      String(t.status || "-").slice(0, 12),
    ]);
    moneyTable(doc, {
      startY: y0 + 4,
      head: [["Worker", "Task", "Date", "Time", "Status"]],
      body: rows.length ? rows : [["-", "No tasks", "", "", ""]],
    });
    paintFooter(doc, "Worker task report");
    doc.save(datedName("worker_tasks", "pdf"));
    showSnackbar("Tasks exported to PDF.", "success");
  };

  const clearFilters = () => {
    setSearchText("");
    setStatusFilter("All");
    setWorkerFilter("All");
    setDateFilter("All");
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1, mb: 2 }}>
          <Typography variant="h5" sx={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 1 }}>
            <Assignment /> Worker Tracking <Chip size="small" label={role} variant="outlined" sx={{ ml: 1 }} />
          </Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            {canManageWorkers && (<Button variant="contained" startIcon={<Add />} onClick={openAddWorker}>Add Worker</Button>)}
            {canAssignTasks && (<Button variant="outlined" startIcon={<Add />} onClick={() => openAddTask()} disabled={(workers || []).length === 0}>Assign Task</Button>)}
          </Box>
        </Box>
        {readOnly && (
          <Alert severity="info" sx={{ mb: 2 }}>Read-only: your role ({role}) can view and export tasks. Only Admin can manage workers/deletes, Admin/Technician can update tasks.</Alert>
        )}

        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={6} sm={6} md={2}>
            <Card><CardContent><Typography variant="caption" color="text.secondary">Workers</Typography><Typography variant="h5">{stats.totalWorkers}</Typography></CardContent></Card>
          </Grid>
          <Grid item xs={6} sm={6} md={2}>
            <Card><CardContent><Typography variant="caption" color="text.secondary">Total Tasks</Typography><Typography variant="h5">{stats.totalTasks}</Typography></CardContent></Card>
          </Grid>
          <Grid item xs={6} sm={6} md={3}>
            <Card><CardContent><Typography variant="caption" color="text.secondary">In Progress</Typography><Typography variant="h5">{stats.inProgress}</Typography></CardContent></Card>
          </Grid>
          <Grid item xs={6} sm={6} md={3}>
            <Card><CardContent><Typography variant="caption" color="text.secondary">Completed</Typography><Typography variant="h5">{stats.completed}</Typography></CardContent></Card>
          </Grid>
          <Grid item xs={12} sm={12} md={2}>
            <Card sx={{ borderColor: stats.overdue > 0 ? "error.main" : undefined, borderWidth: stats.overdue > 0 ? 1 : 0, borderStyle: "solid" }}>
              <CardContent><Typography variant="caption" color={stats.overdue > 0 ? "error" : "text.secondary"}>Overdue</Typography><Typography variant="h5">{stats.overdue}</Typography></CardContent>
            </Card>
          </Grid>
        </Grid>

        <Typography variant="h6" sx={{ mb: 1 }}>Workers</Typography>
        {(workers || []).length === 0 ? (
          <Paper sx={{ p: 3, mb: 2, textAlign: "center" }}>
            <Person sx={{ fontSize: 40, color: "text.disabled" }} />
            <Typography color="text.secondary">No workers yet. Add your first worker to start assigning tire jobs.</Typography>
            {canManageWorkers && (<Button sx={{ mt: 1 }} variant="contained" startIcon={<Add />} onClick={openAddWorker}>Add Worker</Button>)}
          </Paper>
        ) : (
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {(workers || []).map((w) => {
              const s = getWorkerStats(w.id);
              return (
                <Grid item xs={12} sm={6} md={4} lg={3} key={String(w.id)}>
                  <Card sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
                    <CardContent sx={{ flexGrow: 1 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
                        <Avatar>{String(w.name || "?").charAt(0).toUpperCase()}</Avatar>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700 }} noWrap>{w.name}</Typography>
                          <Typography variant="body2" color="text.secondary" noWrap>{w.position}</Typography>
                        </Box>
                      </Box>
                      <Typography variant="body2" color="text.secondary" noWrap>{w.contact}</Typography>
                      <Box sx={{ mt: 1.5 }}>
                        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                          <Typography variant="caption" color="text.secondary">Completion {s.rate}%</Typography>
                          <Typography variant="caption" color="text.secondary">{s.completed}/{s.total}</Typography>
                        </Box>
                        <LinearProgress variant="determinate" value={s.rate} sx={{ height: 8, borderRadius: 4 }} />
                      </Box>
                    </CardContent>
                    <CardActions sx={{ justifyContent: "space-between", px: 2, pb: 2 }}>
                      {canAssignTasks
                        ? (<Button size="small" variant="contained" startIcon={<Add />} onClick={() => openAddTask(w)}>Task</Button>)
                        : (<Typography variant="caption" color="text.secondary">{s.completed}/{s.total} done</Typography>)}
                      {canManageWorkers && (
                      <Box>
                        <Tooltip title="Edit worker"><IconButton size="small" onClick={() => openEditWorker(w)}><Edit fontSize="small" /></IconButton></Tooltip>
                        <Tooltip title="Delete worker"><IconButton size="small" color="error" onClick={() => setConfirmDeleteWorker(w)}><Delete fontSize="small" /></IconButton></Tooltip>
                      </Box>
                      )}
                    </CardActions>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        )}

        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1, mb: 1 }}>
          <Typography variant="h6">Tasks ({filteredTasks.length})</Typography>
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button size="small" variant="outlined" startIcon={<Download />} onClick={exportCSV}>CSV</Button>
            <Button size="small" variant="outlined" startIcon={<Download />} onClick={exportPDF}>PDF</Button>
          </Box>
        </Box>

        <Paper sx={{ p: 2, mb: 2 }}>
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                size="small"
                label="Search task, worker, details"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                InputProps={{ startAdornment: (<InputAdornment position="start"><Search fontSize="small" /></InputAdornment>) }}
              />
            </Grid>
            <Grid item xs={6} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Status</InputLabel>
                <Select value={statusFilter} label="Status" onChange={(e) => setStatusFilter(e.target.value)}>
                  <MenuItem value="All">All</MenuItem>
                  {STATUSES.map((s) => (<MenuItem key={s} value={s}>{s}</MenuItem>))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Worker</InputLabel>
                <Select value={workerFilter} label="Worker" onChange={(e) => setWorkerFilter(e.target.value)}>
                  <MenuItem value="All">All workers</MenuItem>
                  {(workers || []).map((w) => (<MenuItem key={String(w.id)} value={String(w.id)}>{w.name}</MenuItem>))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Date</InputLabel>
                <Select value={dateFilter} label="Date" onChange={(e) => setDateFilter(e.target.value)}>
                  {["All", "Today", "Overdue", "Upcoming"].map((d) => (<MenuItem key={d} value={d}>{d}</MenuItem>))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} md={1}>
              <Button fullWidth variant="text" onClick={clearFilters}>Clear</Button>
            </Grid>
          </Grid>
        </Paper>

        <TableContainer component={Paper} sx={{ overflowX: "auto" }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Worker</TableCell>
                <TableCell>Task</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Time</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Details</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pagedTasks.length === 0 ? (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4 }}><Typography color="text.secondary">No tasks match the current filters.</Typography></TableCell></TableRow>
              ) : (
                pagedTasks.map((t) => (
                  <TableRow key={String(t.id)} hover>
                    <TableCell>{workerById(t.workerId)?.name || <Typography color="text.disabled" variant="body2">Unknown</Typography>}</TableCell>
                    <TableCell>{t.task}</TableCell>
                    <TableCell>{fmtDate(t.date) || t.date || "-"}</TableCell>
                    <TableCell>{String(t.time || "").slice(0, 5) || "-"}</TableCell>
                    <TableCell><Chip size="small" color={statusColor(t.status)} label={t.status} /></TableCell>
                    <TableCell sx={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.details || "-"}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      {canChangeStatus && t.status !== "Completed" && (
                        <Tooltip title="Mark completed"><IconButton size="small" color="success" onClick={() => setTaskStatus(t.id, "Completed")}><CheckCircle fontSize="small" /></IconButton></Tooltip>
                      )}
                      {canChangeStatus && t.status === "In Progress" && (
                        <Tooltip title="Cancel task"><IconButton size="small" color="warning" onClick={() => setTaskStatus(t.id, "Cancelled")}><Cancel fontSize="small" /></IconButton></Tooltip>
                      )}
                      {canChangeStatus && t.status !== "In Progress" && (
                        <Tooltip title="Reopen"><IconButton size="small" onClick={() => setTaskStatus(t.id, "In Progress")}><Replay fontSize="small" /></IconButton></Tooltip>
                      )}
                      {canEditTasks && (<Tooltip title="Edit"><IconButton size="small" onClick={() => openEditTask(t)}><Edit fontSize="small" /></IconButton></Tooltip>)}
                      {canDeleteTasks && (<Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setConfirmDeleteTask(t)}><Delete fontSize="small" /></IconButton></Tooltip>)}
                      {readOnly && (<Typography variant="caption" color="text.secondary">view only</Typography>)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={filteredTasks.length}
            page={page}
            rowsPerPage={rowsPerPage}
            onPageChange={(_, p) => setPage(p)}
            onRowsPerPageChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(0); }}
            rowsPerPageOptions={[5, 10, 25, 50]}
          />
        </TableContainer>

        {/* Worker dialog */}
        <Dialog open={workerDialog} onClose={() => setWorkerDialog(false)} maxWidth="xs" fullWidth>
          <DialogTitle>{editingWorker ? "Edit Worker" : "Add Worker"}</DialogTitle>
          <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1, mt: 1 }}>
            <TextField label="Full name" value={workerForm.name} onChange={(e) => setWorkerForm({ ...workerForm, name: e.target.value })} fullWidth autoFocus />
            <TextField label="Position (e.g. Tire fitter)" value={workerForm.position} onChange={(e) => setWorkerForm({ ...workerForm, position: e.target.value })} fullWidth />
            <TextField label="Contact (phone)" value={workerForm.contact} onChange={(e) => setWorkerForm({ ...workerForm, contact: e.target.value })} fullWidth />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setWorkerDialog(false)}>Cancel</Button>
            <Button variant="contained" onClick={saveWorker}>{editingWorker ? "Save" : "Add"}</Button>
          </DialogActions>
        </Dialog>

        {/* Task dialog (add + edit) */}
        <Dialog open={taskDialog} onClose={() => setTaskDialog(false)} maxWidth="sm" fullWidth>
          <DialogTitle>{editingTask ? "Edit Task" : "Assign Task"}</DialogTitle>
          <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1, mt: 1 }}>
            <FormControl fullWidth>
              <InputLabel>Worker</InputLabel>
              <Select value={taskForm.workerId} label="Worker" onChange={(e) => setTaskForm({ ...taskForm, workerId: e.target.value })}>
                {(workers || []).map((w) => (<MenuItem key={String(w.id)} value={String(w.id)}>{w.name} — {w.position}</MenuItem>))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Task type</InputLabel>
              <Select value={taskForm.task} label="Task type" onChange={(e) => setTaskForm({ ...taskForm, task: e.target.value })}>
                {TASK_TYPES.map((t) => (<MenuItem key={t} value={t}>{t}</MenuItem>))}
              </Select>
            </FormControl>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <DatePicker label="Date" value={safeDate(taskForm.date)} onChange={(d) => setTaskForm({ ...taskForm, date: d })} slotProps={{ textField: { fullWidth: true } }} />
              </Grid>
              <Grid item xs={6}>
                <TimePicker label="Time" value={safeDate(taskForm.time)} onChange={(d) => setTaskForm({ ...taskForm, time: d })} slotProps={{ textField: { fullWidth: true } }} ampm={false} />
              </Grid>
            </Grid>
            {editingTask && (
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select value={taskForm.status} label="Status" onChange={(e) => setTaskForm({ ...taskForm, status: e.target.value })}>
                  {STATUSES.map((s) => (<MenuItem key={s} value={s}>{s}</MenuItem>))}
                </Select>
              </FormControl>
            )}
            <TextField label="Details (vehicle plate, notes...)" value={taskForm.details} onChange={(e) => setTaskForm({ ...taskForm, details: e.target.value })} fullWidth multiline rows={3} />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setTaskDialog(false)}>Cancel</Button>
            <Button variant="contained" onClick={saveTask}>{editingTask ? "Save" : "Assign"}</Button>
          </DialogActions>
        </Dialog>

        {/* Delete confirms */}
        <Dialog open={!!confirmDeleteWorker} onClose={() => setConfirmDeleteWorker(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Delete worker?</DialogTitle>
          <DialogContent><Typography variant="body2" color="text.secondary">{confirmDeleteWorker?.name} and all their tasks will be removed. This cannot be undone.</Typography></DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmDeleteWorker(null)}>Cancel</Button>
            <Button color="error" variant="contained" onClick={() => deleteWorker(confirmDeleteWorker.id)}>Delete</Button>
          </DialogActions>
        </Dialog>

        <Dialog open={!!confirmDeleteTask} onClose={() => setConfirmDeleteTask(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Delete task?</DialogTitle>
          <DialogContent><Typography variant="body2" color="text.secondary">{confirmDeleteTask?.task} on {confirmDeleteTask?.date} will be removed.</Typography></DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmDeleteTask(null)}>Cancel</Button>
            <Button color="error" variant="contained" onClick={() => deleteTask(confirmDeleteTask.id)}>Delete</Button>
          </DialogActions>
        </Dialog>

        <Divider sx={{ my: 2 }} />
        <Typography variant="caption" color="text.secondary">Tasks persist to Supabase (workers / tasks) when configured, otherwise to browser storage. Status values sync to the database automatically.</Typography>

        <SuccessModal open={successModal.open} onClose={() => setSuccessModal((p) => ({ ...p, open: false }))} title={successModal.title} message={successModal.message} details={successModal.details} />
        <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
          <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))} sx={{ width: "100%" }}>{snackbar.message}</Alert>
        </Snackbar>
      </Box>
    </LocalizationProvider>
  );
};

export default WorkerTracking;
