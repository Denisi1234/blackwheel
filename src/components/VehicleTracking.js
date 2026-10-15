import React, { useState, useEffect, useRef } from 'react';
import {
    TextField, Button, Paper, Grid, Typography, Dialog, DialogActions,
    DialogContent, DialogTitle, IconButton, List, ListItem, ListItemText,
    Divider, FormControl, InputLabel, Select, MenuItem, Tooltip, Snackbar,
    Alert, Avatar, Card, CardContent, Box, Chip, AppBar, Toolbar, Container,
    CircularProgress
} from '@mui/material';
import SuccessModal from './SuccessModal';
import {
    Add, Search, Edit, Delete, Download, DirectionsCar, Notifications
} from '@mui/icons-material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { format, addDays, isBefore, isAfter } from 'date-fns';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { getCurrency, formatMoney } from '../lib/settings';
import {
  loadTable,
  insertRow,
  updateRow,
  deleteRow,
  newId,
  isUuid,
  subscribeTable,
  mergeUpsert,
  mergeRemove,
} from '../lib/store';
import {
  paintHeader,
  paintFooter,
  moneyTable,
  money,
  fmtDate,
  sectionCaption,
  datedName,
} from '../lib/documents';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip as ChartTooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, ChartTooltip, Legend);

const VehicleTracking = () => {
    const [vehicles, setVehicles] = useState([]);
    const [searchPlate, setSearchPlate] = useState('');
    const [selectedVehicle, setSelectedVehicle] = useState(null);
    const [newService, setNewService] = useState({
        customerName: '',
        licensePlate: '',
        date: new Date(),
        mechanicName: '',
        workDone: '',
        cost: '',
        nextServiceDate: addDays(new Date(), 180), // Default to 6 months later
    });
    const [openForm, setOpenForm] = useState(false);
    const [editingService, setEditingService] = useState(null);
    const [filter, setFilter] = useState('');
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
    const [isSaving, setIsSaving] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [successModal, setSuccessModal] = useState({ open: false, title: '', message: '', details: [] });
    const [statistics, setStatistics] = useState({
        totalVehicles: 0,
        totalServices: 0,
        totalRevenue: 0,
    });
    const [upcomingServices, setUpcomingServices] = useState([]);
    const loadedRef = useRef(false);

    // Pure cloud (vehicles + services joined).
    useEffect(() => {
        const loadAll = async () => {
            try {
                const [remoteVehicles, remoteServices] = await Promise.all([
                    loadTable("vehicles"),
                    loadTable("services"),
                ]);
                if (remoteVehicles !== null && remoteServices !== null) {
                    const byVehicle = {};
                    (remoteServices || []).forEach((s) => {
                        if (!s) return;
                        const k = String(s.vehicleId ?? "");
                        if (!k) return;
                        (byVehicle[k] = byVehicle[k] || []).push(s);
                    });
                    const joined = (remoteVehicles || []).map((v) => ({
                        ...v,
                        services: byVehicle[String(v.id)] || [],
                    }));
                    setVehicles(joined);
                    updateStatistics(joined);
                    updateUpcomingServices(joined);
                } else {
                    setVehicles([]);
                    updateStatistics([]);
                    updateUpcomingServices([]);
                }
            } catch (e) {
                setVehicles([]);
                updateStatistics([]);
                updateUpcomingServices([]);
            } finally {
                loadedRef.current = true;
            }
        };
        loadAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Realtime: vehicle/service changes on other devices merge in live.
    // Vehicles carry nested services, so service events fold into the
    // owning vehicle instead of a flat list.
    useEffect(() => {
        const foldService = (rows, service, remove) =>
            (Array.isArray(rows) ? rows : []).map((v) => {
                if (!v || !Array.isArray(v.services)) return v;
                const has = v.services.some((s) => s && String(s.id) === String(service?.id ?? service));
                if (remove) {
                    if (!has) return v;
                    return { ...v, services: v.services.filter((s) => !s || String(s.id) !== String(service)) };
                }
                if (String(v.id) === String(service?.vehicleId)) {
                    return { ...v, services: mergeUpsert(v.services, service) };
                }
                return has ? { ...v, services: mergeUpsert(v.services, service) } : v;
            });
        const offs = [
            subscribeTable("vehicles", {
                onInsert: (r) => setVehicles((p) => mergeUpsert(p, { ...r, services: r.services || [] })),
                onUpdate: (r) => setVehicles((p) => mergeUpsert(p, r)),
                onDelete: (id) => setVehicles((p) => mergeRemove(p, id)),
            }),
            subscribeTable("services", {
                onInsert: (r) => setVehicles((p) => foldService(p, r, false)),
                onUpdate: (r) => setVehicles((p) => foldService(p, r, false)),
                onDelete: (id) => setVehicles((p) => foldService(p, id, true)),
            }),
        ];
        return () => {
            offs.forEach((off) => {
                try {
                    off();
                } catch (e) {
                    // ignore
                }
            });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!loadedRef.current) return;
        updateStatistics(vehicles);
        updateUpcomingServices(vehicles);
    }, [vehicles]);

    const updateStatistics = (vehicleData) => {
        const safeData = Array.isArray(vehicleData) ? vehicleData : [];
        const totalVehicles = safeData.length;
        let totalServices = 0;
        let totalRevenue = 0;

        safeData.forEach(vehicle => {
            const services = vehicle.services || [];
            totalServices += services.length;
            services.forEach(service => {
                totalRevenue += parseFloat(service.cost) || 0;
            });
        });

        setStatistics({ totalVehicles, totalServices, totalRevenue });
    };

    const updateUpcomingServices = (vehicleData) => {
        const safeData = Array.isArray(vehicleData) ? vehicleData : [];
        const upcoming = safeData.flatMap(vehicle =>
            (vehicle.services || [])
                .filter(service => {
                    if (!service.nextServiceDate) return false;
                    const d = new Date(service.nextServiceDate);
                    return !Number.isNaN(d.getTime()) && isAfter(d, new Date());
                })
                .map(service => ({
                    ...service,
                    licensePlate: vehicle.licensePlate
                }))
        ).sort((a, b) => new Date(a.nextServiceDate) - new Date(b.nextServiceDate));

        setUpcomingServices(upcoming.slice(0, 5)); // Show top 5 upcoming services
    };

    const handleSearch = () => {
        const plate = (searchPlate || '').toLowerCase();
        const vehicle = vehicles.find(v => (v.licensePlate || '').toLowerCase() === plate);
        if (vehicle) {
            setSelectedVehicle(vehicle);
            showSnackbar('Vehicle found.', 'success');
        } else {
            setSelectedVehicle({ id: newId(), licensePlate: searchPlate, services: [] });
            showSnackbar('New vehicle record created.', 'info');
        }
    };

    const handleAddService = () => {
        if (Object.values(newService).some(field => field === '')) {
            showSnackbar('Please fill in all fields.', 'error');
            return;
        }
        if (!newService.date || !newService.nextServiceDate) {
            showSnackbar('Please select valid dates.', 'error');
            return;
        }
        const costNum = parseFloat(newService.cost);
        if (Number.isNaN(costNum) || costNum < 0) {
            showSnackbar('Cost must be a number >= 0.', 'error');
            return;
        }
        let formattedService;
        try {
            formattedService = {
                id: newId(),
                vehicleId: selectedVehicle.id ?? null,
                ...newService,
                cost: String(costNum),
                date: format(newService.date, 'yyyy-MM-dd'),
                nextServiceDate: format(newService.nextServiceDate, 'yyyy-MM-dd'),
            };
        } catch (e) {
            showSnackbar('Invalid date value.', 'error');
            return;
        }
        setIsSaving(true);
        const snapshot = { ...formattedService };
        setTimeout(() => {
            const currentServices = selectedVehicle.services || [];
            const updatedVehicle = {
                ...selectedVehicle,
                services: [...currentServices, formattedService]
            };
            setVehicles(prevVehicles => {
                const updatedVehicles = prevVehicles.some(v => v.licensePlate === updatedVehicle.licensePlate)
                    ? prevVehicles.map(v => v.licensePlate === updatedVehicle.licensePlate ? updatedVehicle : v)
                    : [...prevVehicles, updatedVehicle];
                return updatedVehicles;
            });
            // Remote mirror: vehicle row first (FK), then the service row.
            if (isUuid(updatedVehicle.id) && isUuid(formattedService.id)) {
                insertRow("vehicles", {
                    id: updatedVehicle.id,
                    licensePlate: updatedVehicle.licensePlate,
                }).then(() => insertRow("services", formattedService));
            }
            setSelectedVehicle(updatedVehicle);
            resetNewServiceForm();
            setOpenForm(false);
            setIsSaving(false);
            showSnackbar('New service added successfully.', 'success');
            setSuccessModal({
                open: true,
                title: 'Service Added',
                message: 'The new service record has been added successfully.',
                details: [
                    { label: 'Plate', value: snapshot.licensePlate || selectedVehicle?.licensePlate || '-' },
                    { label: 'Mechanic', value: snapshot.mechanicName || '-' },
                    { label: 'Work', value: snapshot.workDone || '-' },
                    { label: 'Cost', value: snapshot.cost ? formatMoney(snapshot.cost, getCurrency()) : '-' },
                ],
            });
        }, 600);
    };

    const handleEditService = (service, originalIndex) => {
        const index = typeof originalIndex === 'number' ? originalIndex : service.originalIndex ?? service.index;
        if (index === undefined || index === null) return;
        const { originalIndex: _oi, index: _i, ...cleanService } = service;
        const costNum = parseFloat(cleanService.cost);
        if (Number.isNaN(costNum) || costNum < 0) {
            showSnackbar('Cost must be a number >= 0.', 'error');
            return;
        }
        setIsUpdating(true);
        const snapshot = { ...cleanService, cost: String(costNum) };
        setTimeout(() => {
            const currentServices = [...(selectedVehicle.services || [])];
            currentServices[index] = { ...cleanService, cost: String(costNum) };
            const updatedVehicle = { ...selectedVehicle, services: currentServices };
            setVehicles(vehicles.map(v => v.licensePlate === updatedVehicle.licensePlate ? updatedVehicle : v));
            const savedService = currentServices[index];
            if (savedService && isUuid(savedService.id)) {
                updateRow("services", savedService.id, savedService);
            }
            setSelectedVehicle(updatedVehicle);
            setEditingService(null);
            setIsUpdating(false);
            showSnackbar('Service updated successfully.', 'success');
            setSuccessModal({
                open: true,
                title: 'Service Updated',
                message: 'The service record has been updated successfully.',
                details: [
                    { label: 'Plate', value: updatedVehicle.licensePlate || '-' },
                    { label: 'Mechanic', value: snapshot.mechanicName || '-' },
                    { label: 'Work', value: snapshot.workDone || '-' },
                    { label: 'Cost', value: snapshot.cost ? formatMoney(snapshot.cost, getCurrency()) : '-' },
                ],
            });
        }, 600);
    };

    const handleDeleteService = (originalIndex) => {
        const currentServices = selectedVehicle.services || [];
        const removed = currentServices[originalIndex];
        const updatedVehicle = {
            ...selectedVehicle,
            services: currentServices.filter((_, i) => i !== originalIndex)
        };
        setVehicles(vehicles.map(v => v.licensePlate === updatedVehicle.licensePlate ? updatedVehicle : v));
        if (removed && isUuid(removed.id)) deleteRow("services", removed.id);
        setSelectedVehicle(updatedVehicle);
        showSnackbar('Service deleted successfully.', 'success');
    };

    const handleDeleteVehicle = () => {
        if (!selectedVehicle) return;
        const plate = selectedVehicle.licensePlate || 'this vehicle';
        const ok =
            typeof window === 'undefined' ||
            window.confirm(`Delete ${plate} and all its service records? This cannot be undone.`);
        if (!ok) return;
        const vid = selectedVehicle.id;
        const plateKey = selectedVehicle.licensePlate;
        setVehicles((prev) => (prev || []).filter((v) =>
            vid !== undefined && vid !== null
                ? String(v?.id) !== String(vid)
                : (v?.licensePlate || '').toLowerCase() !== String(plateKey || '').toLowerCase()
        ));
        // Remote services cascade via FK; delete explicitly too for safety.
        (selectedVehicle.services || []).forEach((s) => {
            if (s && isUuid(s.id)) deleteRow("services", s.id);
        });
        if (isUuid(vid)) deleteRow("vehicles", vid);
        setSelectedVehicle(null);
        setEditingService(null);
        showSnackbar('Vehicle deleted successfully.', 'success');
    };

    const generatePDF = () => {
        if (!selectedVehicle) return;
        const doc = new jsPDF();
        const startY = paintHeader(doc, {
            title: 'Service History',
            refNo: selectedVehicle.licensePlate,
        });
        let y = sectionCaption(doc, 'Vehicle', startY);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(15, 23, 42);
        doc.text(String(selectedVehicle.licensePlate || '—').slice(0, 40), 14, y + 1);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        const services = selectedVehicle.services || [];
        const totalCost = services.reduce((s, x) => s + (parseFloat(x.cost) || 0), 0);
        doc.text(
            `${services.length} service(s)  ·  Total ${money(totalCost, getCurrency())}`,
            14,
            y + 7
        );

        const rows = services.map(service => [
            fmtDate(service.date),
            String(service.mechanicName || '—').slice(0, 24),
            String(service.workDone || '—').slice(0, 60),
            money(service.cost, getCurrency()),
            fmtDate(service.nextServiceDate),
        ]);

        y = moneyTable(doc, {
            startY: y + 12,
            head: [['Date', 'Mechanic', 'Work Done', 'Cost', 'Next Service']],
            body: rows.length > 0 ? rows : [['—', 'No services recorded', '', '', '']],
            foot: [['', '', 'Total:', money(totalCost, getCurrency()), '']],
            moneyCols: [3],
        });
        paintFooter(doc, `Service history ${selectedVehicle.licensePlate || ''}`);
        doc.save(datedName(`${selectedVehicle.licensePlate || 'vehicle'}_Service_History`, 'pdf'));
    };

    const getChartData = () => {
        const list = selectedVehicle.services || [];
        const dates = list.map(s => s.date);
        const costs = list.map(s => parseFloat(s.cost) || 0);

        return {
            labels: dates,
            datasets: [
                {
                    label: 'Service Cost',
                    data: costs,
                    fill: false,
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1
                }
            ]
        };
    };

    const resetNewServiceForm = () => {
        setNewService({
            customerName: '',
            licensePlate: '',
            date: new Date(),
            mechanicName: '',
            workDone: '',
            cost: '',
            nextServiceDate: addDays(new Date(), 180),
        });
    };

    const showSnackbar = (message, severity) => {
        setSnackbar({ open: true, message, severity });
    };

    const handleCloseSnackbar = (event, reason) => {
        if (reason === 'clickaway') {
            return;
        }
        setSnackbar({ ...snackbar, open: false });
    };

    return (
        <LocalizationProvider dateAdapter={AdapterDateFns}>
            <Box sx={{ flexGrow: 1 }}>
                <AppBar position="static" color="primary">
                    <Toolbar>
                        <DirectionsCar sx={{ mr: 2 }} />
                        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                            Vehicle Tracking System
                        </Typography>
                    </Toolbar>
                </AppBar>

                <Container maxWidth="lg" sx={{ mt: 4 }}>
                    <Grid container spacing={3}>
                        <Grid item xs={12} md={4}>
                            <Card>
                                <CardContent>
                                    <Typography variant="h6" gutterBottom>
                                        Statistics
                                    </Typography>
                                    <Typography variant="body1">
                                        Total Vehicles: {statistics.totalVehicles}
                                    </Typography>
                                    <Typography variant="body1">
                                        Total Services: {statistics.totalServices}
                                    </Typography>
                                    <Typography variant="body1">
                                        Total Revenue: {formatMoney(statistics.totalRevenue, getCurrency())}
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Grid>

                        <Grid item xs={12} md={8}>
                            <Card>
                                <CardContent>
                                    <Typography variant="h6" gutterBottom>
                                        Upcoming Services
                                    </Typography>
                                    {upcomingServices.map((service, index) => (
                                        <Chip
                                            key={index}
                                            icon={<Notifications />}
                                            label={`${service.licensePlate} - ${service.nextServiceDate}`}
                                            color="primary"
                                            variant="outlined"
                                            sx={{ m: 0.5 }}
                                        />
                                    ))}
                                </CardContent>
                            </Card>
                        </Grid>

                        <Grid item xs={12}>
                            <Paper sx={{ p: 2 }}>
                                <Grid container spacing={2} alignItems="center">
                                    <Grid item xs={12} sm={8}>
                                        <TextField
                                            label="Search by License Plate"
                                            value={searchPlate}
                                            onChange={(e) => setSearchPlate(e.target.value)}
                                            fullWidth
                                        />
                                    </Grid>
                                    <Grid item xs={12} sm={4}>
                                        <Button 
                                            variant="contained" 
                                            color="primary" 
                                            startIcon={<Search />} 
                                            onClick={handleSearch}
                                            fullWidth
                                        >
                                            Search
                                        </Button>
                                    </Grid>
                                </Grid>
                            </Paper>
                        </Grid>

                        {selectedVehicle && (
                            <Grid item xs={12}>
                                <Paper sx={{ p: 2 }}>
                                    <Typography variant="h6" gutterBottom>
                                        Vehicle Information - {selectedVehicle.licensePlate}
                                    </Typography>
                                    <Grid container spacing={2}>
                                        <Grid item xs={12} md={6}>
                                            <FormControl fullWidth margin="normal">
                                                <InputLabel>Filter</InputLabel>
                                                <Select
                                                    value={filter}
                                                    onChange={(e) => setFilter(e.target.value)}
                                                >
                                                    <MenuItem value="">All</MenuItem>
                                                    <MenuItem value="recent">Recently Added</MenuItem>
                                                    <MenuItem value="upcoming">Upcoming Services</MenuItem>
                                                </Select>
                                            </FormControl>
                                            {(selectedVehicle.services || []).length > 0 ? (
                                                <List>
                                                    {(selectedVehicle.services || [])
                                                        .map((service, originalIndex) => ({ service, originalIndex }))
                                                        .filter(({ service }) => {
                                                            if (filter === 'recent') {
                                                                const d = service.date ? new Date(service.date) : null;
                                                                return d && !Number.isNaN(d.getTime()) && isAfter(d, addDays(new Date(), -30));
                                                            } else if (filter === 'upcoming') {
                                                                const d = service.nextServiceDate ? new Date(service.nextServiceDate) : null;
                                                                return d && !Number.isNaN(d.getTime()) && isAfter(d, new Date()) &&
                                                                    isBefore(d, addDays(new Date(), 30));
                                                            }
                                                            return true;
                                                        })
                                                        .map(({ service, originalIndex }) => (
                                                        <React.Fragment key={originalIndex}>
                                                            <ListItem>
                                                                <Avatar sx={{ bgcolor: 'secondary.main', mr: 2 }}>
                                                                    {(service.mechanicName || '?')[0]}
                                                                </Avatar>
                                                                <ListItemText
                                                                    primary={
                                                                        <Typography variant="subtitle1">
                                                                            {service.date} - {service.workDone}
                                                                            <Chip 
                                                                                label={formatMoney(service.cost, getCurrency())}
                                                                                size="small"
                                                                                color="primary"
                                                                                sx={{ ml: 1 }}
                                                                            />
                                                                        </Typography>
                                                                    }
                                                                    secondary={
                                                                        <>
                                                                            <Typography variant="body2">
                                                                                Mechanic: {service.mechanicName}
                                                                            </Typography>
                                                                            <Typography variant="body2">
                                                                                Next Service: {service.nextServiceDate}
                                                                            </Typography>
                                                                        </>
                                                                    }
                                                                />
                                                                <Tooltip title="Edit">
                                                                    <IconButton color="primary" onClick={() => setEditingService({ ...service, originalIndex })}>
                                                                        <Edit />
                                                                    </IconButton>
                                                                </Tooltip>
                                                                <Tooltip title="Delete">
                                                                    <IconButton color="secondary" onClick={() => handleDeleteService(originalIndex)}>
                                                                        <Delete />
                                                                    </IconButton>
                                                                </Tooltip>
                                                            </ListItem>
                                                            <Divider />
                                                        </React.Fragment>
                                                    ))}
                                                </List>
                                            ) : (
                                                <Typography>No records found for this vehicle.</Typography>
                                            )}
                                            <Button
                                                variant="contained"
                                                color="primary"
                                                startIcon={<Add />}
                                                onClick={() => setOpenForm(true)}
                                                sx={{ mt: 2, mr: 1 }}
                                            >
                                                Add New Service
                                            </Button>
                                            <Button
                                                variant="outlined"
                                                color="secondary"
                                                startIcon={<Download />}
                                                onClick={generatePDF}
                                                sx={{ mt: 2, mr: 1 }}
                                            >
                                                Download PDF
                                            </Button>
                                            <Button
                                                variant="outlined"
                                                color="error"
                                                startIcon={<Delete />}
                                                onClick={handleDeleteVehicle}
                                                sx={{ mt: 2 }}
                                            >
                                                Delete Vehicle
                                            </Button>
                                        </Grid>
                                        <Grid item xs={12} md={6}>
                                            <Typography variant="h6" gutterBottom>Service Cost Chart</Typography>
                                            {(selectedVehicle.services || []).length > 0 ? (
                                                <Line data={getChartData()} />
                                            ) : (
                                                <Typography>Not enough data for chart.</Typography>
                                            )}
                                        </Grid>
                                    </Grid>
                                </Paper>
                            </Grid>
                        )}
                    </Grid>


        <Dialog open={openForm} onClose={() => setOpenForm(false)} maxWidth="sm" fullWidth>
            <DialogTitle>Add New Service</DialogTitle>
            <DialogContent>
                <TextField
                    label="Customer Name"
                    value={newService.customerName}
                    onChange={(e) => setNewService({ ...newService, customerName: e.target.value })}
                    fullWidth
                    margin="dense"
                />
                <TextField
                    label="License Plate"
                    value={newService.licensePlate}
                    onChange={(e) => setNewService({ ...newService, licensePlate: e.target.value })}
                    fullWidth
                    margin="dense"
                />
                <DatePicker
                    label="Date"
                    value={newService.date || null}
                    onChange={(newDate) => setNewService({ ...newService, date: newDate })}
                    slotProps={{ textField: { fullWidth: true, margin: 'dense' } }}
                />
                <TextField
                    label="Mechanic Name"
                    value={newService.mechanicName}
                    onChange={(e) => setNewService({ ...newService, mechanicName: e.target.value })}
                    fullWidth
                    margin="dense"
                />
                <TextField
                    label="Work Done"
                    value={newService.workDone}
                    onChange={(e) => setNewService({ ...newService, workDone: e.target.value })}
                    fullWidth
                    margin="dense"
                    multiline
                    rows={3}
                />
                <TextField
                    label="Cost"
                    value={newService.cost}
                    onChange={(e) => setNewService({ ...newService, cost: e.target.value })}
                    fullWidth
                    margin="dense"
                    type="number"
                    inputProps={{ min: 0 }}
                />
                <DatePicker
                    label="Next Service Date"
                    value={newService.nextServiceDate || null}
                    onChange={(newDate) => setNewService({ ...newService, nextServiceDate: newDate })}
                    slotProps={{ textField: { fullWidth: true, margin: 'dense' } }}
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={handleAddService} color="primary" variant="contained" disabled={isSaving} startIcon={isSaving ? <CircularProgress size={20} color="inherit" /> : null}>
                    {isSaving ? 'Saving...' : 'Add'}
                </Button>
                <Button onClick={() => setOpenForm(false)} color="secondary" disabled={isSaving}>
                    Cancel
                </Button>
            </DialogActions>
        </Dialog>

        {editingService && (
            <Dialog open={!!editingService} onClose={() => setEditingService(null)} maxWidth="sm" fullWidth>
                <DialogTitle>Edit Service</DialogTitle>
                <DialogContent>
                    <DatePicker
                        label="Date"
                        value={editingService.date ? new Date(editingService.date) : null}
                        onChange={(newDate) => { if (!newDate || Number.isNaN(new Date(newDate).getTime())) return; setEditingService({ ...editingService, date: format(new Date(newDate), 'yyyy-MM-dd') }); }}
                        slotProps={{ textField: { fullWidth: true, margin: 'dense' } }}
                    />
                    <TextField
                        label="Mechanic Name"
                        value={editingService.mechanicName}
                        onChange={(e) => setEditingService({ ...editingService, mechanicName: e.target.value })}
                        fullWidth
                        margin="dense"
                    />
                    <TextField
                        label="Work Done"
                        value={editingService.workDone}
                        onChange={(e) => setEditingService({ ...editingService, workDone: e.target.value })}
                        fullWidth
                        margin="dense"
                        multiline
                        rows={3}
                    />
                    <TextField
                        label="Cost"
                        value={editingService.cost}
                        onChange={(e) => setEditingService({ ...editingService, cost: e.target.value })}
                        fullWidth
                        margin="dense"
                        type="number"
                        inputProps={{ min: 0 }}
                    />
                    <DatePicker
                        label="Next Service Date"
                        value={editingService.nextServiceDate ? new Date(editingService.nextServiceDate) : null}
                        onChange={(newDate) => { if (!newDate || Number.isNaN(new Date(newDate).getTime())) return; setEditingService({ ...editingService, nextServiceDate: format(new Date(newDate), 'yyyy-MM-dd') }); }}
                        slotProps={{ textField: { fullWidth: true, margin: 'dense' } }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => handleEditService(editingService, editingService.originalIndex ?? editingService.index)} color="primary" variant="contained" disabled={isUpdating} startIcon={isUpdating ? <CircularProgress size={20} color="inherit" /> : null}>
                        {isUpdating ? 'Saving...' : 'Save Changes'}
                    </Button>
                    <Button onClick={() => setEditingService(null)} color="secondary" disabled={isUpdating}>
                        Cancel
                    </Button>
                </DialogActions>
            </Dialog>
        )}

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
                        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
                            {snackbar.message}
                        </Alert>
                    </Snackbar>
                </Container>
            </Box>
        </LocalizationProvider>
    );
};

export default VehicleTracking;