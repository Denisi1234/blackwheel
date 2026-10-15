import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Grid,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Button,
} from '@mui/material';
import { Download, Refresh } from '@mui/icons-material';
import { loadTable, subscribeTable, mergeUpsert, mergeRemove } from '../lib/store';
import { downloadCsv, datedName } from '../lib/documents';
import { getAppLang } from './i18n';

const STR = {
  en: {
    title: 'Audit Log',
    sub: 'Who created, changed or deleted what — newest first, live across devices.',
    adminOnly: 'Only shop admins can view the audit log.',
    search: 'Search actor, record, details',
    action: 'Action',
    table: 'Table',
    allActions: 'All actions',
    allTables: 'All tables',
    thTime: 'Time',
    thActor: 'Actor',
    thAction: 'Action',
    thRecord: 'Record',
    thDetails: 'Details',
    loading: 'Loading…',
    empty: 'No audit entries yet. Changes you make will appear here.',
    count: (n) => `${n} entries (newest 500)`,
    refresh: 'Refresh',
  },
  sw: {
    title: 'Kumbukumbu za Ukaguzi',
    sub: 'Nani aliunda, alibadilisha au alifuta nini — mpya kwanza, moja kwa moja kwenye vifaa.',
    adminOnly: 'Wasimamizi wa duka pekee ndio wanaoweza kuona kumbukumbu za ukaguzi.',
    search: 'Tafuta mtumiaji, rekodi, maelezo',
    action: 'Kitendo',
    table: 'Jedwali',
    allActions: 'Vitendo vyote',
    allTables: 'Majedwali yote',
    thTime: 'Muda',
    thActor: 'Mtumiaji',
    thAction: 'Kitendo',
    thRecord: 'Rekodi',
    thDetails: 'Maelezo',
    loading: 'Inapakia…',
    empty: 'Hakuna kumbukumbu bado. Mabadiliko utakayofanya yataonekana hapa.',
    count: (n) => `Vingilio ${n} (500 mpya zaidi)`,
    refresh: 'Pakia upya',
  },
};

const ACTIONS = ['insert', 'update', 'delete', 'upsert'];

const actionColor = (a) => {
  if (a === 'insert') return 'success';
  if (a === 'delete') return 'error';
  if (a === 'update') return 'warning';
  return 'info';
};

function fmtTime(v) {
  if (!v) return '-';
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleString();
  } catch (e) {
    return String(v);
  }
}

function AuditLog({ user = null, shop = null }) {
  const t = STR[getAppLang()] || STR.en;
  const role = shop?.role || user?.role || 'Staff';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [actionFilter, setActionFilter] = useState('All');
  const [tableFilter, setTableFilter] = useState('All');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const loadAll = async () => {
    setLoading(true);
    try {
      const remote = await loadTable('auditLog');
      setRows(Array.isArray(remote) ? remote : []);
    } catch (e) {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime: entries from other devices prepend live, newest first.
  useEffect(() => {
    const off = subscribeTable('auditLog', {
      onInsert: (r) =>
        setRows((p) => [
          r,
          ...(Array.isArray(p) ? p.filter((x) => !x || String(x.id) !== String(r?.id)) : []),
        ]),
      onUpdate: (r) => setRows((p) => mergeUpsert(p, r)),
      onDelete: (id) => setRows((p) => mergeRemove(p, id)),
    });
    return () => {
      try {
        off();
      } catch (e) {
        // ignore
      }
    };
  }, []);

  const tables = useMemo(() => {
    const s = new Set();
    (rows || []).forEach((r) => {
      if (r?.table_name) s.add(r.table_name);
    });
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    let list = [...(rows || [])];
    const term = searchText.trim().toLowerCase();
    if (term) {
      list = list.filter((r) =>
        String(r.actor_name || '').toLowerCase().includes(term) ||
        String(r.actor_email || '').toLowerCase().includes(term) ||
        String(r.summary || '').toLowerCase().includes(term) ||
        String(r.table_name || '').toLowerCase().includes(term) ||
        String(r.row_id || '').toLowerCase().includes(term)
      );
    }
    if (actionFilter !== 'All') list = list.filter((r) => r.action === actionFilter);
    if (tableFilter !== 'All') list = list.filter((r) => r.table_name === tableFilter);
    list.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    return list;
  }, [rows, searchText, actionFilter, tableFilter]);

  useEffect(() => {
    setPage(0);
  }, [searchText, actionFilter, tableFilter]);

  const paged = useMemo(() => {
    const start = page * rowsPerPage;
    return filtered.slice(start, start + rowsPerPage);
  }, [filtered, page, rowsPerPage]);

  const exportCSV = () => {
    downloadCsv(
      datedName('audit_log', 'csv'),
      ['Time', 'Actor', 'Email', 'Action', 'Table', 'Row', 'Details'],
      filtered.map((r) => [
        fmtTime(r.created_at),
        r.actor_name || '',
        r.actor_email || '',
        r.action || '',
        r.table_name || '',
        r.row_id || '',
        r.summary || '',
      ])
    );
  };

  if (role !== 'Admin') {
    return (
      <Box>
        <Typography variant="h5" gutterBottom color="primary" fontWeight="bold">
          {t.title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t.adminOnly}
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 2 }}>
        <Typography variant="h5" color="primary" fontWeight="bold">
          {t.title}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button size="small" variant="outlined" startIcon={<Refresh />} onClick={loadAll}>{t.refresh}</Button>
          <Button size="small" variant="outlined" startIcon={<Download />} onClick={exportCSV}>CSV</Button>
        </Box>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t.sub} {t.count(filtered.length)}
      </Typography>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={5}>
            <TextField
              fullWidth
              size="small"
              label={t.search}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </Grid>
          <Grid item xs={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>{t.action}</InputLabel>
              <Select value={actionFilter} label={t.action} onChange={(e) => setActionFilter(e.target.value)}>
                <MenuItem value="All">{t.allActions}</MenuItem>
                {ACTIONS.map((a) => (<MenuItem key={a} value={a}>{a}</MenuItem>))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} md={4}>
            <FormControl fullWidth size="small">
              <InputLabel>{t.table}</InputLabel>
              <Select value={tableFilter} label={t.table} onChange={(e) => setTableFilter(e.target.value)}>
                <MenuItem value="All">{t.allTables}</MenuItem>
                {tables.map((tt) => (<MenuItem key={tt} value={tt}>{tt}</MenuItem>))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>{t.thTime}</TableCell>
              <TableCell>{t.thActor}</TableCell>
              <TableCell>{t.thAction}</TableCell>
              <TableCell>{t.thRecord}</TableCell>
              <TableCell>{t.thDetails}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4 }}><Typography color="text.secondary">{t.loading}</Typography></TableCell></TableRow>
            ) : paged.length === 0 ? (
              <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4 }}><Typography color="text.secondary">{t.empty}</Typography></TableCell></TableRow>
            ) : (
              paged.map((r) => (
                <TableRow key={String(r.id)} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtTime(r.created_at)}</TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>{r.actor_name || '—'}</Typography>
                    <Typography variant="caption" color="text.secondary">{r.actor_email || ''}</Typography>
                  </TableCell>
                  <TableCell><Chip size="small" color={actionColor(r.action)} label={r.action || '?'} /></TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{r.table_name || ''} · {String(r.row_id || '').slice(0, 8)}</TableCell>
                  <TableCell sx={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.summary || '—'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={filtered.length}
          page={page}
          rowsPerPage={rowsPerPage}
          onPageChange={(_, p) => setPage(p)}
          onRowsPerPageChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(0); }}
          rowsPerPageOptions={[10, 25, 50, 100]}
        />
      </TableContainer>
    </Box>
  );
}

export default AuditLog;
