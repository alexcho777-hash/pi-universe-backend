/**
 * Acknowledgments Page - π Universe Web
 */

import React, { useEffect, useState } from 'react';
import { Container, Paper, Box, Typography, CircularProgress, Grid, Card, CardContent } from '@mui/material';
import { apiClient } from '../api/ApiClient';

export default function AcknowledgmentsPage() {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const response = await apiClient.getAcknowledgments();
      if (response.success) {
        setData(response.data);
      }
    } finally {
      setIsLoading(false);
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
      <Paper elevation={1} sx={{ p: 3, mb: 3, backgroundColor: '#F5E6D3' }}>
        <Typography variant="h4">感謝與致謝</Typography>
        <Typography variant="subtitle1">Honoring Our Contributors & Donors</Typography>
      </Paper>

      {data && (
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={4}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Total Donations
                </Typography>
                <Typography variant="h5">${data.total_donations || 0}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Donors
                </Typography>
                <Typography variant="h5">{data.total_donors || 0}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Contributors
                </Typography>
                <Typography variant="h5">{data.total_contributors || 0}</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
    </Container>
  );
}
