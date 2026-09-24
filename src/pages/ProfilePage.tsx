/**
 * Profile Page - π Universe Web
 */

import React from 'react';
import { Container, Paper, Box, Typography, Grid, Card, CardContent } from '@mui/material';
import { useAuthStore } from '../stores/authStore';

export default function ProfilePage() {
  const { user } = useAuthStore();

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Paper elevation={1} sx={{ p: 3, mb: 3, backgroundColor: '#F5E6D3' }}>
        <Typography variant="h4">{user?.username || 'User'}</Typography>
        <Typography variant="body2" color="textSecondary">
          ID: {user?.pi_uid}
        </Typography>
      </Paper>

      <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, mt: 3 }}>
        個人資訊
      </Typography>
      <Grid container spacing={2}>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography color="textSecondary">Pi UID</Typography>
              <Typography variant="body1">{user?.pi_uid}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography color="textSecondary">Member Since</Typography>
              <Typography variant="body1">
                {user?.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Container>
  );
}
