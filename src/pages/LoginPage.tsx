/**
 * Login Page - π Universe Web
 */

import React, { useState } from 'react';
import {
  Container,
  Paper,
  Box,
  Button,
  Typography,
  CircularProgress,
  Alert,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoading, error } = useAuthStore();
  const [loginError, setLoginError] = useState<string | null>(null);

  const handlePiLogin = async () => {
    try {
      setLoginError(null);
      await login();
      navigate('/');
    } catch (err: any) {
      setLoginError(err.message || 'Login failed');
    }
  };

  return (
    <Container maxWidth="sm">
      <Box
        display="flex"
        flexDirection="column"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
        gap={2}
      >
        <Paper elevation={3} sx={{ p: 4, width: '100%' }}>
          <Box textAlign="center" mb={3}>
            <Typography variant="h3" component="h1" gutterBottom sx={{ color: '#2563EB' }}>
              π Universe
            </Typography>
            <Typography variant="subtitle1" color="textSecondary">
              Multi-Sanctuary Faith Platform
            </Typography>
          </Box>

          {(loginError || error) && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {loginError || error}
            </Alert>
          )}

          <Box display="flex" flexDirection="column" gap={2}>
            <Button
              variant="contained"
              size="large"
              onClick={handlePiLogin}
              disabled={isLoading}
              sx={{
                backgroundColor: '#2563EB',
                padding: '12px 24px',
                fontSize: '16px',
              }}
            >
              {isLoading ? (
                <>
                  <CircularProgress size={20} sx={{ mr: 1, color: 'white' }} />
                  Logging in...
                </>
              ) : (
                'Login with Pi Network'
              )}
            </Button>

            <Typography variant="body2" color="textSecondary" textAlign="center" sx={{ mt: 2 }}>
              This app requires Pi Network authentication.
              <br />
              Click the button above to authenticate.
            </Typography>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
}
