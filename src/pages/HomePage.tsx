/**
 * Home Page - π Universe Web
 */

import React, { useEffect, useState } from 'react';
import {
  Container,
  Paper,
  Box,
  Button,
  Typography,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  Alert,
} from '@mui/material';
import { useAuthStore } from '../stores/authStore';
import { apiClient } from '../api/ApiClient';
import { Sanctuary } from '../types';

export default function HomePage() {
  const { user } = useAuthStore();
  const [sanctuaries, setSanctuaries] = useState<Sanctuary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSanctuaries();
  }, []);

  const loadSanctuaries = async () => {
    try {
      setIsLoading(true);
      const response = await apiClient.getSanctuaries();
      if (response.success && response.data) {
        setSanctuaries(Array.isArray(response.data) ? response.data : []);
      } else {
        setError(response.error || 'Failed to load sanctuaries');
      }
    } catch (err: any) {
      setError(err.message || 'Error loading sanctuaries');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDailyCheckIn = async () => {
    try {
      const response = await apiClient.dailyCheckIn();
      if (response.success) {
        alert('Daily check-in completed!');
      } else {
        alert(`Check-in failed: ${response.error}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleStartMeditation = async () => {
    try {
      const response = await apiClient.startMeditation(0);
      if (response.success) {
        alert('Meditation session started!');
      } else {
        alert(`Failed to start: ${response.error}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  if (isLoading) {
    return (
      <Container maxWidth="md">
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      {/* Welcome Section */}
      <Paper elevation={1} sx={{ p: 3, mb: 3, backgroundColor: '#F5E6D3' }}>
        <Typography variant="h4" gutterBottom sx={{ color: '#8B4513' }}>
          歡迎回到 π Universe
        </Typography>
        <Typography variant="subtitle1">
          Welcome back, {user?.username || 'Practitioner'}
        </Typography>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Quick Actions */}
      <Box mb={3}>
        <Typography variant="h6" gutterBottom sx={{ color: '#333', fontWeight: 600 }}>
          每日修行
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <Card>
              <CardContent>
                <Button
                  variant="contained"
                  fullWidth
                  sx={{ backgroundColor: '#D4AF37', color: '#000' }}
                  onClick={handleDailyCheckIn}
                >
                  Daily Check-in
                </Button>
                <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                  Ring the bell to begin your day
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Card>
              <CardContent>
                <Button
                  variant="contained"
                  fullWidth
                  sx={{ backgroundColor: '#2563EB' }}
                  onClick={handleStartMeditation}
                >
                  Start Meditation
                </Button>
                <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                  Begin a meditation session
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>

      {/* Sanctuaries Section */}
      <Box>
        <Typography variant="h6" gutterBottom sx={{ color: '#333', fontWeight: 600 }}>
          古刹道場
        </Typography>
        <Grid container spacing={2}>
          {sanctuaries.map((sanctuary) => (
            <Grid item xs={12} key={sanctuary.id}>
              <Card elevation={1}>
                <CardContent>
                  <Typography variant="h6">{sanctuary.name}</Typography>
                  <Typography variant="body2" color="textSecondary" gutterBottom>
                    {sanctuary.religion}
                  </Typography>
                  <Typography variant="body2" sx={{ my: 1 }}>
                    {sanctuary.description}
                  </Typography>
                  <Button variant="outlined" size="small" sx={{ mt: 1 }}>
                    Visit Sanctuary
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>
    </Container>
  );
}
