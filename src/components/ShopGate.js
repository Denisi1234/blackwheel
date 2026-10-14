// ShopGate — shown after sign-in when no shop is active (shared backend).
// Signup-creates-shop: create a shop (you become its Admin), or join one of
// the shops your email was invited to. Multi-shop users can switch anytime.
import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Stack,
  Paper,
  Chip,
} from '@mui/material';
import StorefrontIcon from '@mui/icons-material/Storefront';
import AddBusinessIcon from '@mui/icons-material/AddBusiness';
import GroupAddIcon from '@mui/icons-material/GroupAdd';
import LogoutIcon from '@mui/icons-material/Logout';
import { createShop, enterShop } from '../lib/team';

const STR = {
  en: {
    title: 'Choose your shop',
    sub: 'Each shop keeps its own tires, sales and ledger. Pick one to continue.',
    createTitle: 'Create a new shop',
    createHint: 'You become this shop\u2019s Admin and can invite your sales team.',
    shopName: 'Shop name',
    createBtn: 'Create shop & continue',
    joinTitle: 'You are invited to',
    joinBtn: 'Join',
    noInvites: 'No invitations yet. Create your shop above to get started.',
    continueBtn: 'Continue',
    signOut: 'Sign out',
    yourRole: 'Your role',
    needName: 'Please enter a shop name.',
  },
  sw: {
    title: 'Chagua duka lako',
    sub: 'Kila duka lina matairi, mauzo na hesabu zake. Chagua moja kuendelea.',
    createTitle: 'Fungua duka jipya',
    createHint: 'Utakuwa msimamizi wa duka hili na unaweza kualika timu yako ya mauzo.',
    shopName: 'Jina la duka',
    createBtn: 'Fungua duka na uendelee',
    joinTitle: 'Umealikwa',
    joinBtn: 'Jiunge',
    noInvites: 'Hakuna mialiko bado. Fungua duka lako hapo juu kuanza.',
    continueBtn: 'Endelea',
    signOut: 'Toka',
    yourRole: 'Wadhfa wako',
    needName: 'Tafadhali ingiza jina la duka.',
  },
};

function ShopGate({ authUser, memberships = [], onEnter, onSignOut }) {
  const [lang, setLang] = useState(() => {
    try {
      return localStorage.getItem('app_lang') === 'sw' ? 'sw' : 'en';
    } catch (e) {
      return 'en';
    }
  });
  useEffect(() => {
    const sync = () => {
      try {
        setLang(localStorage.getItem('app_lang') === 'sw' ? 'sw' : 'en');
      } catch (e) { /* ignore */ }
    };
    window.addEventListener('app_lang_change', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('app_lang_change', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  const t = STR[lang] || STR.en;
  const [mode, setMode] = useState(
    memberships && memberships.length > 0 ? 'join' : 'create'
  );
  const [shopName, setShopName] = useState('');
  const [picked, setPicked] = useState(memberships && memberships[0] ? memberships[0].shopId : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async (e) => {
    if (e) e.preventDefault();
    setError('');
    if (!String(shopName || '').trim()) {
      setError(t.needName);
      return;
    }
    setLoading(true);
    try {
      const { membership } = await createShop(
        authUser,
        shopName.trim(),
        authUser?.name
      );
      onEnter(enterShop(membership) || membership);
    } catch (err) {
      setError(err.message || 'Could not create shop.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = () => {
    setError('');
    const m = (memberships || []).find((x) => String(x.shopId) === String(picked));
    if (!m) {
      setError(t.noInvites);
      return;
    }
    onEnter(enterShop(m) || m);
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: (th) => (th.palette.mode === 'dark' ? '#0f172a' : '#f8fafc'),
      }}
    >
      <Container maxWidth="xs" sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', py: 4 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
          <Box sx={{ width: 40, height: 40, borderRadius: 1, bgcolor: 'primary.main', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <StorefrontIcon sx={{ fontSize: 24, color: '#fff' }} />
          </Box>
          <Box>
            <Typography variant="h6" fontWeight={700} lineHeight={1.2}>Black Wheel</Typography>
            <Typography variant="body2" color="text.secondary">{t.title}</Typography>
          </Box>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t.sub}</Typography>

        {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2, borderRadius: 1 }}>{error}</Alert>}

        {(memberships || []).length > 0 && (
          <Paper elevation={0} sx={{ p: 2, mb: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>{t.joinTitle}</Typography>
            <Stack spacing={1}>
              {(memberships || []).map((m) => (
                <Paper
                  key={String(m.shopId)}
                  elevation={0}
                  onClick={() => { setPicked(m.shopId); setMode('join'); }}
                  sx={{
                    p: 1.5,
                    border: 1,
                    borderColor: String(picked) === String(m.shopId) && mode === 'join' ? 'primary.main' : 'divider',
                    borderRadius: 1.5,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Box>
                    <Typography variant="body2" fontWeight={700}>{m.shopName}</Typography>
                    <Typography variant="caption" color="text.secondary">{t.yourRole}: {m.role}</Typography>
                  </Box>
                  <Chip size="small" label={m.role} color={m.role === 'Admin' ? 'primary' : 'default'} variant="outlined" />
                </Paper>
              ))}
            </Stack>
            <Button fullWidth variant="contained" disableElevation disabled={loading || !picked} onClick={handleJoin} startIcon={<GroupAddIcon />} sx={{ mt: 1.5, textTransform: 'none', fontWeight: 700, borderRadius: 1 }}>
              {t.joinBtn}
            </Button>
          </Paper>
        )}

        <Paper elevation={0} sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
          <Typography variant="subtitle2" fontWeight={700}>{t.createTitle}</Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>{t.createHint}</Typography>
          <Box component="form" onSubmit={handleCreate} noValidate>
            <TextField
              fullWidth size="small" label={t.shopName} value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              margin="dense" required placeholder=""
            />
            <Button fullWidth type="submit" variant={(memberships || []).length > 0 ? 'outlined' : 'contained'} disableElevation disabled={loading} startIcon={<AddBusinessIcon />} sx={{ mt: 1, textTransform: 'none', fontWeight: 700, borderRadius: 1 }}>
              {loading ? <CircularProgress size={22} color="inherit" /> : t.createBtn}
            </Button>
          </Box>
        </Paper>

        <Button fullWidth variant="text" size="small" startIcon={<LogoutIcon />} onClick={onSignOut} sx={{ mt: 2, textTransform: 'none' }}>
          {t.signOut} ({authUser?.email || ''})
        </Button>
      </Container>
    </Box>
  );
}

export default ShopGate;
