import React, { useState, useMemo, useCallback } from 'react';
import { 
  Paper, Typography, Grid, Card, CardContent, Avatar, useTheme, Modal, 
  IconButton, Box, TextField, Button, FormControl, InputLabel, Select, 
  MenuItem, Collapse 
} from '@mui/material';
import { 
  PieChart as PieChartIcon, AttachMoney as AttachMoneyIcon, 
  TrendingUp as TrendingUpIcon, ShowChart as ShowChartIcon, 
  Close as CloseIcon, Inventory as InventoryIcon, 
  Category as CategoryIcon, LocalShipping as LocalShippingIcon, 
  Speed as SpeedIcon, TrendingDown as TrendingDownIcon,
  ExpandMore as ExpandMoreIcon, ExpandLess as ExpandLessIcon
} from '@mui/icons-material';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Area, AreaChart
} from 'recharts';
import { getCurrency, formatMoney } from '../lib/settings';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FFC658', '#8DD1E1'];

const safeDate = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString();
};

const StatCard = ({ stat }) => (
  <Card
    sx={{
      bgcolor: stat.color,
      color: 'white',
      boxShadow: '0 4px 20px 0 rgba(0,0,0,0.12)',
      borderRadius: 3,
      transition: 'all 0.3s ease-in-out',
      '&:hover': {
        transform: 'translateY(-5px) scale(1.02)',
        boxShadow: '0 12px 20px 0 rgba(0,0,0,0.2)',
      },
      overflow: 'hidden',
      position: 'relative',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
    }}
  >
    <CardContent sx={{ p: 3, flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <Box>
        <Avatar sx={{ 
          bgcolor: 'rgba(255, 255, 255, 0.4)', 
          width: 60, 
          height: 60, 
          mb: 2,
          boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
        }}>
          {stat.icon}
        </Avatar>
        <Typography variant="body1" sx={{ 
          fontWeight: 'medium', 
          fontSize: '1.1rem', 
          mb: 1,
          textShadow: '1px 1px 2px rgba(0,0,0,0.1)'
        }}>
          {stat.label}
        </Typography>
      </Box>
      <Typography variant="h6" sx={{ 
        fontWeight: 'bold',
        textShadow: '1px 1px 2px rgba(0,0,0,0.1)',
        mt: 2,
      }}>
        {stat.value}
      </Typography>
    </CardContent>
    <Box 
      sx={{ 
        position: 'absolute', 
        top: 0, 
        right: 0, 
        width: '50%', 
        height: '100%', 
        background: 'rgba(255,255,255,0.1)', 
        transform: 'skew(-20deg) translateX(50%)',
      }}
    />
  </Card>
);

function Dashboard({ tires = [], sales = [] }) {
  const theme = useTheme();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedChart, setSelectedChart] = useState(null);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedSize, setSelectedSize] = useState('');
  const [expanded, setExpanded] = useState(false);
  const currency = getCurrency();

  const handleExpandClick = () => {
    setExpanded(!expanded);
  };

  // Filters apply to both stat cards and charts (previously charts only).
  const filteredTiresForStats = useMemo(() => {
    return (tires || []).filter((t) =>
      (!selectedBrand || t?.brand === selectedBrand) &&
      (!selectedSize || t?.size === selectedSize)
    );
  }, [tires, selectedBrand, selectedSize]);

  const filteredSalesForStats = useMemo(() => {
    const list = sales || [];
    if (!dateRange.start && !dateRange.end) return list;
    const start = dateRange.start ? new Date(dateRange.start) : null;
    const end = dateRange.end ? new Date(dateRange.end) : null;
    return list.filter((s) => {
      if (!s?.date) return true;
      const d = new Date(s.date);
      if (Number.isNaN(d.getTime())) return true;
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    });
  }, [sales, dateRange]);

  const statistics = useMemo(() => {
    const ft = filteredTiresForStats;
    const fs = filteredSalesForStats;
    const costOf = (t) => {
      const raw = t && t.costPrice !== undefined && t.costPrice !== '' ? t.costPrice : t?.price;
      const n = Number(raw);
      return Number.isFinite(n) ? n : 0;
    };
    const totalTires = ft.reduce((sum, tire) => sum + (Number(tire.stock) || 0), 0);
    const totalValue = ft.reduce((sum, tire) => sum + (costOf(tire) * (Number(tire.stock) || 0)), 0);
    const totalSales = fs.reduce((sum, sale) => sum + ((Number(sale.price) || 0) * (Number(sale.quantity) || 0)), 0);
    const totalProfit = fs.reduce((sum, sale) => sum + (Number(sale.profit) || 0), 0);
    const uniqueBrands = new Set(ft.map(tire => tire.brand).filter(Boolean)).size;
    const averagePrice = totalTires > 0 ? totalValue / totalTires : 0;

    const tireSales = {};
    fs.forEach(sale => {
      const k = String(sale.tireId);
      tireSales[k] = (tireSales[k] || 0) + (Number(sale.quantity) || 0);
    });

    let topSellingTire = { brand: 'Unknown', model: 'Unknown', quantity: 0 };
    if (Object.keys(tireSales).length > 0) {
      const topSellingTireId = Object.keys(tireSales).reduce((a, b) => tireSales[a] > tireSales[b] ? a : b);
      const foundTire = ft.find((tire) => String(tire?.id) === String(topSellingTireId));
      if (foundTire) {
        topSellingTire = {
          brand: foundTire.brand || 'Unknown',
          model: foundTire.model || foundTire.size || 'Unknown',
          quantity: tireSales[topSellingTireId]
        };
      }
    }

    const inventoryTurnover = totalValue > 0 ? totalSales / totalValue : 0;

    let lowestStockTire = { brand: 'Unknown', stock: 0 };
    if (ft.length > 0) {
      lowestStockTire = ft.reduce((min, tire) =>
        (Number(tire.stock) || 0) < (Number(min.stock) || Infinity) ? tire : min
      , {stock: Infinity});
    }

    const averageProfit = totalSales > 0 ? totalProfit / totalSales * 100 : 0;
    const mostExpensiveTire = ft.length > 0
      ? ft.reduce((max, tire) => (costOf(tire) > costOf(max) ? tire : max), ft[0])
      : { brand: '-', model: '', price: 0 };
    const leastProfitableTire = fs.length > 0 ? fs.reduce((min, sale) => {
      const denom = (Number(sale.price) || 0) * (Number(sale.quantity) || 0);
      const profitMargin = denom > 0 ? (Number(sale.profit) / denom) * 100 : Infinity;
      return profitMargin < min.profitMargin ? { ...sale, profitMargin } : min;
    }, { profitMargin: Infinity }) : null;

    return [
      { icon: <PieChartIcon fontSize="large" />, label: 'Total Tire Count', value: totalTires, color: '#3f51b5' },
      { icon: <AttachMoneyIcon fontSize="large" />, label: 'Total Stock Value', value: formatMoney(totalValue, currency), color: '#f44336' },
      { icon: <TrendingUpIcon fontSize="large" />, label: 'Total Sales', value: formatMoney(totalSales, currency), color: '#4caf50' },
      { icon: <ShowChartIcon fontSize="large" />, label: 'Total Profit', value: formatMoney(totalProfit, currency), color: '#ff9800' },
      { icon: <InventoryIcon fontSize="large" />, label: 'Unique Brand Count', value: uniqueBrands, color: '#9c27b0' },
      { icon: <CategoryIcon fontSize="large" />, label: 'Average Tire Price', value: formatMoney(averagePrice, currency), color: '#2196f3' },
      { icon: <LocalShippingIcon fontSize="large" />, label: 'Best Selling Tire', value: `${topSellingTire.brand} ${topSellingTire.model} (${topSellingTire.quantity} pcs)`, color: '#607d8b' },
      { icon: <SpeedIcon fontSize="large" />, label: 'Inventory Turnover', value: inventoryTurnover.toFixed(2), color: '#795548' },
      { icon: <TrendingDownIcon fontSize="large" />, label: 'Lowest Stock Tire', value: `${lowestStockTire.brand || 'Unknown'} (${lowestStockTire.stock || 0} pcs)`, color: '#e91e63' },
      { icon: <TrendingUpIcon fontSize="large" />, label: 'Average Profit Margin', value: `${averageProfit.toFixed(2)}%`, color: '#4caf50' },
      { icon: <AttachMoneyIcon fontSize="large" />, label: 'Most Expensive Tire', value: `${mostExpensiveTire?.brand || '-'} ${mostExpensiveTire?.model || mostExpensiveTire?.size || ''} (${formatMoney(costOf(mostExpensiveTire), currency)})`, color: '#f44336' },
      { icon: <TrendingDownIcon fontSize="large" />, label: 'Lowest Profit Margin Sale', value: fs.length === 0 || !leastProfitableTire ? '-' : `${leastProfitableTire?.tireId ?? '-'} (${Number.isFinite(leastProfitableTire?.profitMargin) ? leastProfitableTire.profitMargin.toFixed(2) : '-'}%)`, color: '#ff9800' },
    ];
  }, [filteredTiresForStats, filteredSalesForStats, currency]);

  const salesData = useMemo(() =>
    sales.map((sale) => ({
      date: safeDate(sale?.date),
      sales: (Number(sale?.price) || 0) * (Number(sale?.quantity) || 0),
      profit: Number(sale?.profit) || 0
    }))
  , [sales]);

  const tireData = useMemo(() =>
    tires.map(tire => {
      const raw = tire && tire.costPrice !== undefined && tire.costPrice !== '' ? tire.costPrice : tire?.price;
      const cost = Number(raw);
      return {
        name: tire.name || `${tire.brand || 'N/A'} ${tire.size || ''}`.trim() || 'N/A',
        brand: tire.brand || 'N/A',
        size: tire.size || 'N/A',
        stock: Number(tire.stock) || 0,
        value: (Number.isFinite(cost) ? cost : 0) * (Number(tire.stock) || 0)
      };
    })
  , [tires]);

  const handleChartClick = (chartType) => {
    setSelectedChart(chartType);
    setModalOpen(true);
  };

  const handleDateRangeChange = (event) => {
    setDateRange({ ...dateRange, [event.target.name]: event.target.value });
  };

  const filterDataByDateRange = useCallback((data) => {
    if (!dateRange.start || !dateRange.end) return data;
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    return data.filter(item => {
      const itemDate = new Date(item.date);
      return itemDate >= start && itemDate <= end;
    });
  }, [dateRange]);

  const filterTireData = useCallback((data) => {
    return data.filter(tire => 
      (!selectedBrand || tire.brand === selectedBrand) &&
      (!selectedSize || tire.size === selectedSize)
    );
  }, [selectedBrand, selectedSize]);

  const uniqueBrands = useMemo(() => [...new Set(tires.map((tire) => tire?.brand).filter(Boolean))], [tires]);
  const uniqueSizes = useMemo(() => [...new Set(tires.map((tire) => tire?.size).filter(Boolean))], [tires]);

  const renderChart = (chartType, height = 300, data = salesData) => {
    const filteredSalesData = filterDataByDateRange(data);
    const filteredTireData = filterTireData(tireData);
    
    switch (chartType) {
      case 'line':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <LineChart data={filteredSalesData}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
              <XAxis dataKey="date" tick={{ fill: theme.palette.text.secondary, fontSize: 12 }} />
              <YAxis yAxisId="left" tick={{ fill: theme.palette.text.secondary, fontSize: 12 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: theme.palette.text.secondary, fontSize: 12 }} />
              <Tooltip contentStyle={{ backgroundColor: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: 8 }} />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="sales" stroke="#8884d8" name="Sales" strokeWidth={2} />
              <Line yAxisId="right" type="monotone" dataKey="profit" stroke="#82ca9d" name="Profit" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        );
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <BarChart data={filteredSalesData}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
              <XAxis dataKey="date" tick={{ fill: theme.palette.text.secondary, fontSize: 12 }} />
              <YAxis yAxisId="left" tick={{ fill: theme.palette.text.secondary, fontSize: 12 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: theme.palette.text.secondary, fontSize: 12 }} />
              <Tooltip contentStyle={{ backgroundColor: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: 8 }} />
              <Legend />
              <Bar yAxisId="left" dataKey="sales" fill="#8884d8" name="Sales" />
              <Bar yAxisId="right" dataKey="profit" fill="#82ca9d" name="Profit" />
            </BarChart>
          </ResponsiveContainer>
        );
      case 'area':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={filteredSalesData}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
              <XAxis dataKey="date" tick={{ fill: theme.palette.text.secondary, fontSize: 12 }} />
              <YAxis tick={{ fill: theme.palette.text.secondary, fontSize: 12 }} />
              <Tooltip contentStyle={{ backgroundColor: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: 8 }} />
              <Legend />
              <Area type="monotone" dataKey="sales" stackId="1" stroke="#8884d8" fill="#8884d8" name="Sales" />
              <Area type="monotone" dataKey="profit" stackId="1" stroke="#82ca9d" fill="#82ca9d" name="Profit" />
            </AreaChart>
          </ResponsiveContainer>
        );
      case 'pie':
        const totalSales = filteredSalesData.reduce((sum, data) => sum + data.sales, 0);
        const totalProfit = filteredSalesData.reduce((sum, data) => sum + data.profit, 0);
        const pieData = [
          { name: 'Sales', value: totalSales },
          { name: 'Profit', value: totalProfit },
        ];
        return (
          <ResponsiveContainer width="100%" height={height}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: 8 }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        );
      case 'tire-line':
      case 'tire-bar':
      case 'tire-area':
      case 'tire-pie':
        return renderTireChart(chartType, height, filteredTireData);
      default:
        return null;
    }
  };

  const renderTireChart = (chartType, height, data) => {
    switch (chartType) {
      case 'tire-line':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
              <XAxis dataKey="name" tick={{ fill: theme.palette.text.secondary, fontSize: 12 }} />
              <YAxis yAxisId="left" tick={{ fill: theme.palette.text.secondary, fontSize: 12 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: theme.palette.text.secondary, fontSize: 12 }} />
              <Tooltip contentStyle={{ backgroundColor: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: 8 }} />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="stock" stroke="#8884d8" name="Stock" strokeWidth={2} />
              <Line yAxisId="right" type="monotone" dataKey="value" stroke="#82ca9d" name="Value" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        );
      case 'tire-bar':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
              <XAxis dataKey="name" tick={{ fill: theme.palette.text.secondary, fontSize: 12 }} />
              <YAxis yAxisId="left" tick={{ fill: theme.palette.text.secondary, fontSize: 12 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: theme.palette.text.secondary, fontSize: 12 }} />
              <Tooltip contentStyle={{ backgroundColor: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: 8 }} />
              <Legend />
              <Bar yAxisId="left" dataKey="stock" fill="#8884d8" name="Stock" />
              <Bar yAxisId="right" dataKey="value" fill="#82ca9d" name="Value" />
            </BarChart>
          </ResponsiveContainer>
        );
      case 'tire-area':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
              <XAxis dataKey="name" tick={{ fill: theme.palette.text.secondary, fontSize: 12 }} />
              <YAxis tick={{ fill: theme.palette.text.secondary, fontSize: 12 }} />
              <Tooltip contentStyle={{ backgroundColor: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: 8 }} />
              <Legend />
              <Area type="monotone" dataKey="stock" stackId="1" stroke="#8884d8" fill="#8884d8" name="Stock" />
              <Area type="monotone" dataKey="value" stackId="1" stroke="#82ca9d" fill="#82ca9d" name="Value" />
            </AreaChart>
          </ResponsiveContainer>
        );
      case 'tire-pie':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: theme.palette.background.paper, border: `1px solid ${theme.palette.divider}`, borderRadius: 8 }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        );
      default:
        return null;
    }
  };

  return (
    <Paper elevation={6} sx={{ 
      p: 4, 
      mb: 4, 
      borderRadius: 4, 
      bgcolor: theme.palette.background.default, 
      position: 'relative',
      backgroundImage: 'linear-gradient(to bottom right, rgba(63, 81, 181, 0.1), rgba(255, 152, 0, 0.1))',
    }}>
      <Typography variant="h4" gutterBottom color="primary" sx={{ 
        fontWeight: 'bold', 
        mb: 4, 
        textAlign: 'center',
        textShadow: '2px 2px 4px rgba(0,0,0,0.1)'
      }}>
        Tire Sales Dashboard
      </Typography>
      
      <Grid container spacing={4} sx={{ mb: 4 }}>
        {statistics.slice(0, 4).map((stat, index) => (
          <Grid item xs={12} sm={6} md={3} key={index}>
            <StatCard stat={stat} />
          </Grid>
        ))}
      </Grid>

      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
        <IconButton
          onClick={handleExpandClick}
          aria-expanded={expanded}
          aria-label="show more"
          sx={{
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.3s',
          }}
        >
          {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>

      <Collapse in={expanded} timeout="auto" unmountOnExit>
        <Grid container spacing={4} sx={{ mb: 4 }}>
          {statistics.slice(4).map((stat, index) => (
            <Grid item xs={12} sm={6} md={3} key={index + 4}>
              <StatCard stat={stat} />
            </Grid>
          ))}
        </Grid>
      </Collapse>

      <Typography variant="h5" color="primary" sx={{ 
        mb: 4, 
        textAlign: 'center',
        textShadow: '1px 1px 2px rgba(0,0,0,0.1)'
      }}>
        Sales and Profit Charts
      </Typography>

      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap' }}>
        <TextField
          label="Start Date"
          type="date"
          name="start"
          value={dateRange.start}
          onChange={handleDateRangeChange}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          label="End Date"
          type="date"
          name="end"
          value={dateRange.end}
          onChange={handleDateRangeChange}
          InputLabelProps={{ shrink: true }}
        />
        <FormControl sx={{ minWidth: 120 }}>
          <InputLabel id="brand-select-label">Brand</InputLabel>
          <Select
            labelId="brand-select-label"
            value={selectedBrand}
            onChange={(e) => setSelectedBrand(e.target.value)}
            label="Brand"
          >
            <MenuItem value="">
              <em>All</em>
            </MenuItem>
            {uniqueBrands.map((brand) => (
              <MenuItem key={brand} value={brand}>{brand}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl sx={{ minWidth: 120 }}>
          <InputLabel id="size-select-label">Size</InputLabel>
          <Select
            labelId="size-select-label"
            value={selectedSize}
            onChange={(e) => setSelectedSize(e.target.value)}
            label="Size"
          >
            <MenuItem value="">
              <em>All</em>
            </MenuItem>
            {uniqueSizes.map((size) => (
              <MenuItem key={size} value={size}>{size}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button 
          variant="contained" 
          onClick={() => {
            setDateRange({ start: '', end: '' });
            setSelectedBrand('');
            setSelectedSize('');
          }}
          sx={{ height: '56px' }}
        >
          Clear Filters
        </Button>
      </Box>

      <Grid container spacing={4}>
        {['line', 'bar', 'area', 'pie'].map((chartType) => (
          <Grid item xs={12} md={6} key={chartType}>
            <Card 
              sx={{ 
                height: '100%', 
                cursor: 'pointer',
                transition: 'all 0.3s ease-in-out',
                '&:hover': {
                  transform: 'scale(1.02)',
                  boxShadow: '0 8px 16px 0 rgba(0,0,0,0.2)',
                },
                position: 'relative',
                overflow: 'hidden',
                borderRadius: 3,
              }}
              onClick={() => handleChartClick(chartType)}
            >
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom sx={{ 
                  textAlign: 'center',
                  fontWeight: 'bold',
                  color: theme.palette.primary.main,
                  textShadow: '1px 1px 2px rgba(0,0,0,0.1)'
                }}>
                  {chartType === 'line' ? 'Sales and Profit Line Chart' : 
                   chartType === 'bar' ? 'Sales and Profit Bar Chart' : 
                   chartType === 'area' ? 'Sales and Profit Area Chart' : 'Sales and Profit Pie Chart'}
                </Typography>
                {renderChart(chartType)}
              </CardContent>
              <Box 
                sx={{ 
                  position: 'absolute', 
                  bottom: 0, 
                  left: 0, 
                  width: '100%', 
                  height: '5px', 
                  background: 'linear-gradient(90deg, #00C9FF 0%, #92FE9D 100%)',
                }}
              />
            </Card>
          </Grid>
        ))}
      </Grid>

      <Typography variant="h5" color="primary" sx={{ 
        mt: 6,
        mb: 4, 
        textAlign: 'center',
        textShadow: '1px 1px 2px rgba(0,0,0,0.1)'
      }}>
        Tire Stock and Value Charts
      </Typography>

      <Grid container spacing={4}>
        {['tire-line', 'tire-bar', 'tire-area', 'tire-pie'].map((chartType) => (
          <Grid item xs={12} md={6} key={chartType}>
            <Card 
              sx={{ 
                height: '100%', 
                cursor: 'pointer',
                transition: 'all 0.3s ease-in-out',
                '&:hover': {
                  transform: 'scale(1.02)',
                  boxShadow: '0 8px 16px 0 rgba(0,0,0,0.2)',
                },
                position: 'relative',
                overflow: 'hidden',
                borderRadius: 3,
              }}
              onClick={() => handleChartClick(chartType)}
            >
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom sx={{ 
                  textAlign: 'center',
                  fontWeight: 'bold',
                  color: theme.palette.primary.main,
                  textShadow: '1px 1px 2px rgba(0,0,0,0.1)'
                }}>
                  {chartType === 'tire-line' ? 'Tire Stock and Value Line Chart' : 
                   chartType === 'tire-bar' ? 'Tire Stock and Value Bar Chart' : 
                   chartType === 'tire-area' ? 'Tire Stock and Value Area Chart' : 'Tire Stock and Value Pie Chart'}
                </Typography>
                {renderChart(chartType)}
              </CardContent>
              <Box 
                sx={{ 
                  position: 'absolute', 
                  bottom: 0, 
                  left: 0, 
                  width: '100%', 
                  height: '5px', 
                  background: 'linear-gradient(90deg, #00C9FF 0%, #92FE9D 100%)',
                }}
              />
            </Card>
          </Grid>
        ))}
      </Grid>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        aria-labelledby="modal-modal-title"
        aria-describedby="modal-modal-description"
      >
        <Box sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: { xs: '95%', sm: '90%' },
          maxHeight: '90vh',
          overflow: 'auto',
          bgcolor: 'background.paper',
          boxShadow: 24,
          p: { xs: 2, sm: 4 },
          borderRadius: 3,
        }}>
          <IconButton
            aria-label="close"
            onClick={() => setModalOpen(false)}
            sx={{
              position: 'absolute',
              right: 8,
              top: 8,
              color: (theme) => theme.palette.grey[500],
            }}
          >
            <CloseIcon />
          </IconButton>
          <Typography id="modal-modal-title" variant="h6" component="h2" sx={{ 
            mb: 2,
            textAlign: 'center',
            fontWeight: 'bold',
            color: theme.palette.primary.main,
            textShadow: '1px 1px 2px rgba(0,0,0,0.1)'
          }}>
            {selectedChart === 'line' ? 'Sales and Profit Line Chart' : 
             selectedChart === 'bar' ? 'Sales and Profit Bar Chart' : 
             selectedChart === 'area' ? 'Sales and Profit Area Chart' : 
             selectedChart === 'pie' ? 'Sales and Profit Pie Chart' :
             selectedChart === 'tire-line' ? 'Tire Stock and Value Line Chart' : 
             selectedChart === 'tire-bar' ? 'Tire Stock and Value Bar Chart' : 
             selectedChart === 'tire-area' ? 'Tire Stock and Value Area Chart' : 'Tire Stock and Value Pie Chart'}
          </Typography>
          {renderChart(selectedChart, 400)}
        </Box>
      </Modal>
    </Paper>
  );
}

export default Dashboard;