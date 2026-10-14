// TeamManagement — admin-only people management for the current shop.
// Invite by email: the invitee registers with that email and automatically
// receives the invited role. Strangers land as Staff (pending) until approved.
// Deactivation blocks the next login. Writes are additionally enforced by RLS.
import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Switch,
  Alert,
  Stack,
  IconButton,
  Tooltip,
  CircularProgress,
  TablePagination,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import {
  loadTable,
  insertRow,
  updateRow,
  deleteRow,
  newId,
  isSupabaseConfigured,
} from '../lib/store';
import { TEAM_ROLES, INVITE_ROLES } from '../lib/team';

const FALLBACK_KEY = 'teamProfiles';

const STR = {
  en: {
    team: 'Team',
    sub: 'Invite salespeople by email. They register with that email and automatically receive the invited role. Unknown registrations wait as Staff until approved.',
    readOnly: 'Read-only: only shop admins can invite or change roles.',
    inviteTitle: 'Invite team member',
    fullName: 'Full name',
    email: 'Email',
    role: 'Role',
    inviteBtn: 'Invite',
    thName: 'Name',
    thEmail: 'Email',
    thRole: 'Role',
    thStatus: 'Status',
    thActions: 'Actions',
    empty: 'No team members yet — send the first invite above.',
    you: 'you',
    stInvited: 'Invited',
    stPending: 'Pending approval',
    stDeactivated: 'Deactivated',
    tipDeactivate: 'Deactivate login',
    tipReactivate: 'Reactivate login',
    tipRemove: 'Remove from team',
    errValid: 'Enter a valid name and email.',
    errDuplicate: 'This email is already on the team.',
    errSelfRole: 'You cannot change your own role.',
    errSelfDeactivate: 'You cannot deactivate yourself.',
    errSelfRemove: 'You cannot remove yourself.',
    msgRemoved: 'Team member removed.',
    shopSettings: 'Shop settings',
    shopName: 'Shop name',
    saveShop: 'Save name',
    errShopName: 'Enter a shop name.',
    msgShopRenamed: 'Shop name updated.',
    invitedAs: (name, role, email) => `${name} invited as ${role}. They register with ${email} and get the role automatically.`,
    roleAdmin: 'Admin',
    roleTechnician: 'Technician',
    roleSales: 'Sales',
    roleStaff: 'Staff',
  },
  sw: {
    team: 'Timu',
    sub: 'Waalinike wauzaji kwa barua pepe. Wanajisajili na barua pepe hiyo na hupokea wadhfa kiotomatiki. Wasiyojulikana husubiri kama Staff hadi kuidhinishwa.',
    readOnly: 'Soma tu: wasimamizi wa duka pekee ndio wanaoweza kualika au kubadilisha wadhfa.',
    inviteTitle: 'Mwalike mtu wa timu',
    fullName: 'Jina kamili',
    email: 'Barua pepe',
    role: 'Wadhfa',
    inviteBtn: 'Alika',
    thName: 'Jina',
    thEmail: 'Barua pepe',
    thRole: 'Wadhfa',
    thStatus: 'Hali',
    thActions: 'Vitendo',
    empty: 'Hakuna wafanyakazi bado — tuma mwaliko wa kwanza hapo juu.',
    you: 'wewe',
    stInvited: 'Amealikwa',
    stPending: 'Inasubiri kuidhinishwa',
    stDeactivated: 'Imezimwa',
    tipDeactivate: 'Zima kuingia',
    tipReactivate: 'Washia kuingia',
    tipRemove: 'Ondoa kwenye timu',
    errValid: 'Ingiza jina na barua pepe sahihi.',
    errDuplicate: 'Barua pepe hii tayari iko kwenye timu.',
    errSelfRole: 'Huwezi kubadilisha wadhfa wako mwenyewe.',
    errSelfDeactivate: 'Huwezi kujizima mwenyewe.',
    errSelfRemove: 'Huwezi kujiondoa mwenyewe.',
    msgRemoved: 'Mtu wa timu ameondolewa.',
    shopSettings: 'Mipangilio ya duka',
    shopName: 'Jina la duka',
    saveShop: 'Hifadhi jina',
    errShopName: 'Ingiza jina la duka.',
    msgShopRenamed: 'Jina la duka limehifadhiwa.',
    invitedAs: (name, role, email) => `${name} amealikwa kama ${role}. Atajisajili na ${email} na kupokea wadhfa kiotomatiki.`,
    roleAdmin: 'Msimamizi',
    roleTechnician: 'Fundi',
    roleSales: 'Muuza',
    roleStaff: 'Staff',
  },
};

function teamLang() {
  try {
    return localStorage.getItem('app_lang') === 'sw' ? 'sw' : 'en';
  } catch (e) {
    return 'en';
  }
}

function roleLabel(t, role) {
  if (role === 'Admin') return t.roleAdmin;
  if (role === 'Technician') return t.roleTechnician;
  if (role === 'Sales') return t.roleSales;
  return t.roleStaff;
}

function TeamManagement({ shop = null, currentUser = null, onShopRenamed = null }) {
  const shopId = shop?.id || '';
  // Offline single-device mode has no roles backend — the local user is admin.
  const isAdmin =
    !isSupabaseConfigured() || (shop?.role || currentUser?.role) === 'Admin';
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [form, setForm] = useState({ name: '', email: '', role: 'Sales' });
  const [shopNameDraft, setShopNameDraft] = useState('');
  const [savingShop, setSavingShop] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [langTick, setLangTick] = useState(0);
  useEffect(() => {
    const sync = () => setLangTick((x) => x + 1);
    window.addEventListener('app_lang_change', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('app_lang_change', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  const loadedRef = useRef(false);
  const t = STR[teamLang()] || STR.en;
  void langTick;

  const safeParse = () => {
    try {
      const raw = localStorage.getItem(FALLBACK_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  };

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      try {
        const remote = await loadTable('profiles');
        if (remote !== null) {
          setProfiles(
            shopId
              ? (remote || []).filter((p) => String(p?.shopId) === String(shopId))
              : remote || []
          );
        } else {
          const local = safeParse();
          setProfiles(
            shopId ? local.filter((p) => String(p?.shopId || '') === String(shopId) || !p?.shopId) : local
          );
        }
      } catch (e) {
        setProfiles([]);
      } finally {
        setLoading(false);
        loadedRef.current = true;
      }
    };
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  useEffect(() => {
    if (!loadedRef.current) return;
    try {
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(profiles));
    } catch (e) {
      // ignore
    }
  }, [profiles]);

  const rows = useMemo(
    () => [...(profiles || [])].sort((a, b) => String(a?.email || '').localeCompare(String(b?.email || ''))),
    [profiles]
  );

  // Invite rows keep their pre-registration id, so "self" must match by
  // email as well — otherwise an admin could demote or remove themselves.
  const selfEmail = String(currentUser?.email || '').trim().toLowerCase();
  const isSelf = (p) =>
    String(p?.id) === String(currentUser?.id) ||
    (selfEmail !== '' && String(p?.email || '').trim().toLowerCase() === selfEmail);

  const showMsg = (setter, text) => {
    setter(text);
    setTimeout(() => setter(''), 4000);
  };

  const handleInvite = async (e) => {
    if (e) e.preventDefault();
    setError('');
    const name = String(form.name || '').trim();
    const email = String(form.email || '').trim().toLowerCase();
    if (!name || !email || !email.includes('@')) {
      showMsg(setError, t.errValid);
      return;
    }
    if ((profiles || []).some((p) => String(p?.email || '').toLowerCase() === email)) {
      showMsg(setError, t.errDuplicate);
      return;
    }
    setSaving(true);
    try {
      const record = {
        id: newId(),
        shopId: shopId || '',
        shop_name: shop?.name || '',
        email,
        name,
        role: INVITE_ROLES.includes(form.role) ? form.role : 'Sales',
        invited: true,
        active: true,
      };
      setProfiles((prev) => [...(prev || []), record]);
      await insertRow('profiles', record);
      setForm({ name: '', email: '', role: 'Sales' });
      showMsg(setInfo, t.invitedAs(name, roleLabel(t, record.role), email));
    } finally {
      setSaving(false);
    }
  };

  const patchProfile = async (id, patch) => {
    setProfiles((prev) =>
      (prev || []).map((p) => (String(p?.id) === String(id) ? { ...p, ...patch } : p))
    );
    await updateRow('profiles', id, patch);
  };

  const findRow = (id) =>
    (profiles || []).find((p) => String(p?.id) === String(id));

  const handleRoleChange = (id, nextRole) => {
    if (isSelf(findRow(id) || { id })) {
      showMsg(setError, t.errSelfRole);
      return;
    }
    if (!TEAM_ROLES.includes(nextRole)) return;
    patchProfile(id, { role: nextRole });
  };

  const handleActiveToggle = (row) => {
    if (isSelf(row)) {
      showMsg(setError, t.errSelfDeactivate);
      return;
    }
    patchProfile(row.id, { active: !(row.active !== false) });
  };

  const handleRemove = async (id) => {
    if (isSelf(findRow(id) || { id })) {
      showMsg(setError, t.errSelfRemove);
      return;
    }
    setProfiles((prev) => (prev || []).filter((p) => String(p?.id) !== String(id)));
    await deleteRow('profiles', id);
    showMsg(setInfo, t.msgRemoved);
  };

  const handleRenameShop = async () => {
    const name = String(shopNameDraft || '').trim();
    if (!name) {
      showMsg(setError, t.errShopName);
      return;
    }
    if (!shop?.id) return;
    setSavingShop(true);
    try {
      await updateRow('shops', shop.id, { name });
      if (typeof onShopRenamed === 'function') onShopRenamed(name);
      showMsg(setInfo, t.msgShopRenamed);
    } finally {
      setSavingShop(false);
    }
  };

  useEffect(() => {
    setShopNameDraft(shop?.name || '');
  }, [shop?.id, shop?.name]);

  return (
    <Box>
      <Typography variant="h5" gutterBottom color="primary" fontWeight="bold">
        {t.team}{shop?.name ? ` — ${shop.name}` : ''}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t.sub}
      </Typography>

      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2, borderRadius: 1 }}>{error}</Alert>}
      {info && <Alert severity="success" onClose={() => setInfo('')} sx={{ mb: 2, borderRadius: 1 }}>{info}</Alert>}

      {!isAdmin && (
        <Alert severity="info" sx={{ mb: 2, borderRadius: 1 }}>
          {t.readOnly}
        </Alert>
      )}

      {isAdmin && (
        <Paper elevation={0} sx={{ p: 2, mb: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
            {t.inviteTitle}
          </Typography>
          <Box component="form" onSubmit={handleInvite} noValidate sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <TextField size="small" label={t.fullName} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required sx={{ minWidth: 180 }} />
            <TextField size="small" label={t.email} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required sx={{ minWidth: 220 }} />
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel id="invite-role-label">{t.role}</InputLabel>
              <Select labelId="invite-role-label" value={form.role} label={t.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {INVITE_ROLES.map((r) => (
                  <MenuItem key={r} value={r}>{roleLabel(t, r)}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button type="submit" variant="contained" disableElevation disabled={saving} startIcon={<PersonAddIcon />} sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 1 }}>
              {saving ? <CircularProgress size={22} color="inherit" /> : t.inviteBtn}
            </Button>
          </Box>
        </Paper>
      )}

      {isAdmin && shop?.id && (
        <Paper elevation={0} sx={{ p: 2, mb: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
            {t.shopSettings}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <TextField
              size="small"
              label={t.shopName}
              value={shopNameDraft}
              onChange={(e) => setShopNameDraft(e.target.value)}
              sx={{ minWidth: 240 }}
            />
            <Button variant="outlined" disableElevation disabled={savingShop} onClick={handleRenameShop} sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 1 }}>
              {savingShop ? <CircularProgress size={22} color="inherit" /> : t.saveShop}
            </Button>
          </Box>
        </Paper>
      )}

      <TableContainer component={Paper} sx={{ overflowX: "auto" }}>
        <Table stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell><strong>{t.thName}</strong></TableCell>
              <TableCell><strong>{t.thEmail}</strong></TableCell>
              <TableCell><strong>{t.thRole}</strong></TableCell>
              <TableCell><strong>{t.thStatus}</strong></TableCell>
              <TableCell align="right"><strong>{t.thActions}</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} align="center"><CircularProgress size={24} /></TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={5} align="center">{t.empty}</TableCell></TableRow>
            ) : (
              rows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((p) => {
                const rowSelf = isSelf(p);
                const active = p.active !== false;
                return (
                  <TableRow key={String(p?.id)}>
                    <TableCell>{p?.name || '—'}{rowSelf ? ` (${t.you})` : ''}</TableCell>
                    <TableCell>{p?.email || '—'}</TableCell>
                    <TableCell>
                      {isAdmin && !rowSelf ? (
                        <Select size="small" value={p?.role || 'Staff'} onChange={(e) => handleRoleChange(p.id, e.target.value)}>
                          {TEAM_ROLES.map((r) => (
                            <MenuItem key={r} value={r}>{roleLabel(t, r)}</MenuItem>
                          ))}
                        </Select>
                      ) : (
                        <Chip size="small" label={roleLabel(t, p?.role || 'Staff')} variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip
                          size="small"
                          label={!active ? t.stDeactivated : p?.invited ? t.stInvited : t.stPending}
                          color={!active ? 'error' : p?.invited ? 'success' : 'warning'}
                          variant="outlined"
                        />
                        {isAdmin && !rowSelf && (
                          <Tooltip title={active ? t.tipDeactivate : t.tipReactivate}>
                            <Switch size="small" checked={active} onChange={() => handleActiveToggle(p)} />
                          </Tooltip>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell align="right">
                      {isAdmin && !rowSelf && (
                        <Tooltip title={t.tipRemove}>
                          <IconButton size="small" color="error" onClick={() => handleRemove(p.id)}>
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
        <TablePagination
          component="div"
          count={rows.length}
          page={page}
          rowsPerPage={rowsPerPage}
          onPageChange={(_, p) => setPage(p)}
          onRowsPerPageChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(0); }}
          rowsPerPageOptions={[5, 10, 25]}
        />
      </TableContainer>
    </Box>
  );
}

export default TeamManagement;
