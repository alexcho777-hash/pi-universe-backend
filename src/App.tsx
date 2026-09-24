/**
 * π Universe Web - Main App Component
 */

import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { CircularProgress, Box, CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { useAuthStore } from './stores/authStore';
import HomePage from './pages/HomePage';
import AcknowledgmentsPage from './pages/AcknowledgmentsPage';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import Navigation from './components/Navigation';

// Create Material-UI theme (replace React Native Paper colors)
const theme = createTheme({
  palette: {
    primary: {
      main: '#2563EB', // π Universe primary blue
    },
    secondary: {
      main: '#D4AF37', // Gold
    },
    background: {
      default: '#f5f5f5',
    },
  },
  typography: {
    fontFamily: 'Roboto, sans-serif',
  },
});

export default function App() {
  const { isAuthenticated, isLoading, initialize } = useAuthStore();

  useEffect(() => {
    // Initialize auth on app load
    initialize();
  }, [initialize]);

  if (isLoading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        {isAuthenticated ? (
          <Box display="flex" flexDirection="column" minHeight="100vh">
            {/* Main content */}
            <Box flex={1} overflow="auto" pb={8}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/acknowledgments" element={<AcknowledgmentsPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
            </Box>

            {/* Bottom navigation */}
            <Navigation />
          </Box>
        ) : (
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="*" element={<Navigate to="/login" />} />
          </Routes>
        )}
      </Router>
    </ThemeProvider>
  );
}
