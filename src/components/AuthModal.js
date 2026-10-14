import React, { useState, useMemo } from 'react';
import {
  Box,
  Container,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  InputAdornment,
  IconButton,
  Tabs,
  Tab,
  Divider,
  FormControlLabel,
  Checkbox,
  Stack,
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

import { supabase } from '../lib/supabaseClient';
import { isSupabaseConfigured } from '../lib/store';
import { resolveShopMemberships } from '../lib/team';
import i18n from './i18n';

const translations = {
  en: {
    signInTab: 'Sign In',
    registerTab: 'Create Account',
    welcomeBack: 'Welcome Back',
    signInPrompt: 'Enter your credentials to access your workspace.',
    createAccountTitle: 'Create New Account',
    createAccountPrompt: 'Set up a profile to manage tires and inventory.',
    forgotPasswordTitle: 'Reset Password',
    forgotPasswordPrompt: 'Enter your email to receive reset instructions.',
    sendResetLink: 'Send Reset Link',
    backToSignIn: 'Back to Sign In',
    emailLabel: 'Email Address',
    passwordLabel: 'Password',
    confirmPasswordLabel: 'Confirm Password',
    fullNameLabel: 'Full Name',
    roleLabel: 'System Role',
    rememberMe: 'Remember this device',
    forgotPassword: 'Forgot password?',
    signInButton: 'Sign In',
    registerButton: 'Create Account',
    offlineNotice: 'Offline mode — sign in with any email; the profile is created from what you type and stays in this browser.',
    adminRole: 'Administrator',
    technicianRole: 'Technician',
    salesRole: 'Sales Lead',
    agreeTerms: 'I agree to the Terms of Service and Privacy Policy.',
    errorEmpty: 'Please enter both email and password.',
    errorPassLength: 'Password must be at least 6 characters long.',
    errorPassMatch: 'Passwords do not match.',
    errorTerms: 'Please accept the Terms of Service to proceed.',
    resetSuccessMsg: 'Password reset email sent! Check your inbox.',
    deactivatedMsg: 'This account has been deactivated. Contact your shop administrator.',
    roleAssignedByAdmin: 'Your shop admin assigns your role after you join.',
  },
  sw: {
    signInTab: 'Ingia',
    registerTab: 'Fungua Akaunti',
    welcomeBack: 'Karibu tena',
    signInPrompt: 'Ingiza taarifa zako ili uingie sehemu yako ya kazi.',
    createAccountTitle: 'Fungua Akaunti Mpya',
    createAccountPrompt: 'Tengeneza wasifu ili usimamie matairi na akiba.',
    forgotPasswordTitle: 'Sahau Nenosiri',
    forgotPasswordPrompt: 'Ingiza barua pepe yako ili kupokea maelekezo ya kuweka upya.',
    sendResetLink: 'Tuma Kiungo',
    backToSignIn: 'Rudi kwa Kuingia',
    emailLabel: 'Barua Pepe',
    passwordLabel: 'Nenosiri',
    confirmPasswordLabel: 'Thibitisha Nenosiri',
    fullNameLabel: 'Jina Kamili',
    roleLabel: 'Wadhfa',
    rememberMe: 'Nikumbuke',
    forgotPassword: 'Umesahau nenosiri?',
    signInButton: 'Ingia',
    registerButton: 'Fungua Akaunti',
    offlineNotice: 'Modo wa nje ya mtandao — ingia na barua pepe yoyote; wasifu huundwa kwa ulichoandika na hubaki kwenye kivinjari hiki.',
    adminRole: 'Msimamizi',
    technicianRole: 'Fundi',
    salesRole: 'Muuza',
    agreeTerms: 'Nakubali Masharti ya Matumizi na Sera ya Faragha.',
    errorEmpty: 'Tafadhali ingiza barua pepe na nenosiri.',
    errorPassLength: 'Nenosiri lazima liwe na herufi 6 au zaidi.',
    errorPassMatch: 'Nenosiri hazifanani.',
    errorTerms: 'Endelea kwa kukubali masharti.',
    resetSuccessMsg: 'Barua ya kuweka upya imetumwa! Angalia kikasha chako.',
    deactivatedMsg: 'Akaunti hii imezimwa. Wasiliana na msimamizi wa duka lako.',
    roleAssignedByAdmin: 'Msimamizi wa duka lako atakuwekea wadhfa baada ya kujiunga.',
  },
};

function AuthModal({ onLoginSuccess, darkMode = false, onToggleDarkMode }) {
  const [lang, setLang] = useState(() => {
    try {
      return localStorage.getItem('app_lang') === 'sw' ? 'sw' : 'en';
    } catch (e) {
      return 'en';
    }
  });
  const t = translations[lang] || translations.en;

  const [viewMode, setViewMode] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [agreeTerms, setAgreeTerms] = useState(true);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const supabaseReady = isSupabaseConfigured();

  const toggleLanguage = () => {
    const next = lang === 'en' ? 'sw' : 'en';
    setLang(next);
    try {
      localStorage.setItem('app_lang', next);
      if (i18n && i18n.changeLanguage) i18n.changeLanguage(next);
      window.dispatchEvent(new Event('app_lang_change'));
    } catch (e) { /* ignore */ }
  };

  const passwordHint = useMemo(() => {
    if (!password) return '';
    if (password.length < 6) return 'min 6 chars';
    return `${password.length} chars`;
  }, [password]);

  // Adopt the profile role for this shop (invite match, approval state).
  // Returns memberships array, or null when blocked (error already shown).
  const finishOnlineLogin = async (authId, authEmail, displayName, avatar) => {
    const resolved = await resolveShopMemberships({ id: authId, email: authEmail });
    if (resolved && resolved.blocked) {
      setErrorMsg(t.deactivatedMsg);
      try {
        if (supabase && supabase.auth) await supabase.auth.signOut();
      } catch (e) {
        // ignore
      }
      return null;
    }
    const memberships = (resolved && resolved.memberships) || [];
    const primary = memberships[0];
    onLoginSuccess({
      id: authId,
      email: authEmail,
      name: displayName || String(authEmail || "").split("@")[0],
      role: primary ? primary.role : "Staff",
      avatar: avatar || "",
      memberships,
    }, null);
    return memberships;
  };

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    if (!email.trim() || !password) {
      setErrorMsg(t.errorEmpty);
      return;
    }
    setLoading(true);
    try {
      if (supabaseReady) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        if (data?.user) {
          await finishOnlineLogin(
            data.user.id,
            data.user.email,
            data.user.user_metadata?.full_name,
            data.user.user_metadata?.avatar_url
          );
        }
      } else {
        onLoginSuccess({
          id: `usr_${Date.now()}`,
          email: email.trim(),
          name: email.trim().split('@')[0],
          role: 'Staff',
          avatar: '',
        }, null);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to sign in.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    if (e) e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    if (!email.trim() || !password) {
      setErrorMsg(t.errorEmpty);
      return;
    }
    if (password.length < 6) {
      setErrorMsg(t.errorPassLength);
      return;
    }
    if (confirmPassword && password !== confirmPassword) {
      setErrorMsg(t.errorPassMatch);
      return;
    }
    if (!agreeTerms) {
      setErrorMsg(t.errorTerms);
      return;
    }
    setLoading(true);
    try {
      if (supabaseReady) {
        // No self-assigned roles: everybody registers as Staff. An admin
        // invite (same email) upgrades the role automatically on sign-in,
        // and the shop admin approves everyone else in the Team screen.
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: fullName.trim() || email.split('@')[0], role: 'Staff' } },
        });
        if (error) throw error;
        if (data?.session) {
          await finishOnlineLogin(
            data.user.id,
            data.user.email,
            fullName.trim(),
            data.user.user_metadata?.avatar_url
          );
        } else {
          setSuccessMsg('Account created. Check your email, then sign in.');
          setViewMode(0);
        }
      } else {
        onLoginSuccess({
          id: `usr_${Date.now()}`,
          email: email.trim(),
          name: fullName.trim() || email.split('@')[0],
          role: 'Staff',
          avatar: '',
        }, null);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to register.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    if (e) e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    if (!email.trim()) {
      setErrorMsg(t.errorEmpty);
      return;
    }
    setLoading(true);
    try {
      if (supabaseReady) {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setSuccessMsg(t.resetSuccessMsg);
      } else {
        setSuccessMsg(t.resetSuccessMsg + ' (offline mode)');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Unable to send reset email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: (th) => (th.palette.mode === 'dark' ? '#0f172a' : '#f8fafc'),
      }}
    >
      {/* Center form — flat, lean, full-page */}
      <Container maxWidth="xs" sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', py: 4 }}>
        <Box sx={{ textAlign: 'left', mb: 2 }}>
          <Typography variant="h5" fontWeight={700} gutterBottom>
            {viewMode === 0 ? t.welcomeBack : viewMode === 1 ? t.createAccountTitle : t.forgotPasswordTitle}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {viewMode === 0 ? t.signInPrompt : viewMode === 1 ? t.createAccountPrompt : t.forgotPasswordPrompt}
          </Typography>
        </Box>

        {viewMode !== 2 && (
          <Tabs
            value={viewMode}
            onChange={(_e, v) => { setViewMode(v); setErrorMsg(''); setSuccessMsg(''); }}
            variant="fullWidth"
            textColor="primary"
            indicatorColor="primary"
            sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
          >
            <Tab label={t.signInTab} sx={{ textTransform: 'none', fontWeight: 600 }} />
            <Tab label={t.registerTab} sx={{ textTransform: 'none', fontWeight: 600 }} />
          </Tabs>
        )}

        {errorMsg && <Alert severity="error" onClose={() => setErrorMsg('')} sx={{ mb: 2, borderRadius: 1 }}>{errorMsg}</Alert>}
        {successMsg && <Alert severity="success" onClose={() => setSuccessMsg('')} sx={{ mb: 2, borderRadius: 1 }}>{successMsg}</Alert>}

        {viewMode === 0 && (
          <Box component="form" onSubmit={handleLogin} noValidate>
            <TextField
              fullWidth size="small" label={t.emailLabel} type="email" required
              value={email} onChange={(e) => setEmail(e.target.value)}
              margin="dense" autoComplete="email" placeholder="name@company.com"
              InputProps={{ startAdornment: <InputAdornment position="start"><EmailOutlinedIcon fontSize="small" /></InputAdornment> }}
            />
            <TextField
              fullWidth size="small" label={t.passwordLabel} required
              type={showPassword ? 'text' : 'password'}
              value={password} onChange={(e) => setPassword(e.target.value)}
              margin="dense" autoComplete="current-password"
              InputProps={{
                startAdornment: <InputAdornment position="start"><LockOutlinedIcon fontSize="small" /></InputAdornment>,
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setShowPassword(!showPassword)} edge="end" aria-label="toggle password">
                      {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.5, mb: 1.5 }}>
              <FormControlLabel
                control={<Checkbox size="small" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />}
                label={<Typography variant="body2" color="text.secondary">{t.rememberMe}</Typography>}
              />
              <Button size="small" variant="text" onClick={() => { setViewMode(2); setErrorMsg(''); setSuccessMsg(''); }} sx={{ textTransform: 'none' }}>
                {t.forgotPassword}
              </Button>
            </Stack>
            <Button fullWidth type="submit" variant="contained" disableElevation disabled={loading} sx={{ py: 1.2, textTransform: 'none', fontWeight: 700, borderRadius: 1 }}>
              {loading ? <CircularProgress size={22} color="inherit" /> : t.signInButton}
            </Button>
          </Box>
        )}

        {viewMode === 1 && (
          <Box component="form" onSubmit={handleRegister} noValidate>
            <TextField
              fullWidth size="small" label={t.fullNameLabel} required
              value={fullName} onChange={(e) => setFullName(e.target.value)}
              margin="dense" placeholder="Your full name"
              InputProps={{ startAdornment: <InputAdornment position="start"><PersonOutlineIcon fontSize="small" /></InputAdornment> }}
            />
            <TextField
              fullWidth size="small" label={t.emailLabel} type="email" required
              value={email} onChange={(e) => setEmail(e.target.value)}
              margin="dense" autoComplete="email"
              InputProps={{ startAdornment: <InputAdornment position="start"><EmailOutlinedIcon fontSize="small" /></InputAdornment> }}
            />
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
              {t.roleAssignedByAdmin}
            </Typography>
            <TextField
              fullWidth size="small" label={t.passwordLabel} required
              type={showPassword ? 'text' : 'password'}
              value={password} onChange={(e) => setPassword(e.target.value)}
              margin="dense" autoComplete="new-password"
              helperText={passwordHint}
              InputProps={{
                startAdornment: <InputAdornment position="start"><LockOutlinedIcon fontSize="small" /></InputAdornment>,
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setShowPassword(!showPassword)} edge="end">
                      {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              fullWidth size="small" label={t.confirmPasswordLabel} required
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
              margin="dense"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setShowConfirmPassword(!showConfirmPassword)} edge="end">
                      {showConfirmPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <FormControlLabel
              sx={{ mt: 0.5, mb: 1.5 }}
              control={<Checkbox size="small" checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)} />}
              label={<Typography variant="caption" color="text.secondary">{t.agreeTerms}</Typography>}
            />
            <Button fullWidth type="submit" variant="contained" disableElevation disabled={loading} sx={{ py: 1.2, textTransform: 'none', fontWeight: 700, borderRadius: 1 }}>
              {loading ? <CircularProgress size={22} color="inherit" /> : t.registerButton}
            </Button>
          </Box>
        )}

        {viewMode === 2 && (
          <Box component="form" onSubmit={handleResetPassword} noValidate>
            <TextField
              fullWidth size="small" label={t.emailLabel} type="email" required
              value={email} onChange={(e) => setEmail(e.target.value)}
              margin="dense" autoComplete="email"
              InputProps={{ startAdornment: <InputAdornment position="start"><EmailOutlinedIcon fontSize="small" /></InputAdornment> }}
            />
            <Button fullWidth type="submit" variant="contained" disableElevation disabled={loading} sx={{ mt: 1.5, mb: 1, py: 1.2, textTransform: 'none', fontWeight: 700, borderRadius: 1 }}>
              {loading ? <CircularProgress size={22} color="inherit" /> : t.sendResetLink}
            </Button>
            <Button fullWidth variant="text" startIcon={<ArrowBackIcon />} onClick={() => { setViewMode(0); setErrorMsg(''); setSuccessMsg(''); }} sx={{ textTransform: 'none' }}>
              {t.backToSignIn}
            </Button>
          </Box>
        )}

        {!supabaseReady && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="caption" color="text.secondary" display="block" textAlign="center">
              {t.offlineNotice}
            </Typography>
          </>
        )}
      </Container>
      <Box textAlign="center" sx={{ pb: 3 }}>
        <Button size="small" variant="text" onClick={toggleLanguage} sx={{ textTransform: 'none', fontWeight: 600 }}>
          {lang === 'en' ? 'Kiswahili' : 'English'}
        </Button>
      </Box>
    </Box>
  );
}

export default AuthModal;
