/**
 * Settings Page - π Universe Web
 */

import React, { useState } from 'react';
import { Container, Paper, Box, Typography, Switch, Button, Alert } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { logout } = useAuthStore();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to sign out?')) {
      await logout();
      navigate('/login');
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
        應用設置
      </Typography>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography>Notifications</Typography>
          <Switch
            checked={notificationsEnabled}
            onChange={(e) => setNotificationsEnabled(e.target.checked)}
          />
        </Box>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography>Sound Effects</Typography>
          <Switch
            checked={soundEnabled}
            onChange={(e) => setSoundEnabled(e.target.checked)}
          />
        </Box>
      </Paper>

      <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, mt: 3 }}>
        隱私與安全
      </Typography>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="body2">
          All your meditation records and donations are securely stored and never shared.
        </Typography>
      </Paper>

      <Button
        variant="contained"
        color="error"
        fullWidth
        onClick={handleLogout}
        sx={{ mt: 3 }}
      >
        Sign Out
      </Button>
    </Container>
  );
}
