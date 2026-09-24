/**
 * Auth Store - π Universe Web with Pi Network SDK
 * Uses Pi.authenticate() instead of JWT
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AuthState, User } from '../types';
import { apiClient } from '../api/ApiClient';

declare global {
  interface Window {
    Pi?: any;
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      error: null,

      initialize: async () => {
        try {
          set({ isLoading: true });

          // Check if Pi SDK is available
          if (!window.Pi) {
            console.warn('Pi SDK not loaded yet');
            set({ isLoading: false });
            return;
          }

          // Pi.authenticate() will prompt user if not logged in
          // Returns: { user: { uid, username }, accessToken, ... }
          const authResult = await window.Pi.authenticate();

          if (authResult && authResult.user) {
            const piUser: User = {
              pi_uid: authResult.user.uid,
              username: authResult.user.username || `User_${authResult.user.uid.slice(0, 8)}`,
              user_id: authResult.user.uid,
            };

            // Register/sync user with backend
            try {
              const response = await apiClient.post('/api/users/sync', {
                pi_uid: piUser.pi_uid,
                username: piUser.username,
              });

              if (response.data?.data) {
                piUser.user_id = response.data.data.user_id;
                piUser.sanctuary_id = response.data.data.sanctuary_id;
                piUser.created_at = response.data.data.created_at;
              }
            } catch (err) {
              console.error('Failed to sync user:', err);
            }

            set({
              user: piUser,
              isAuthenticated: true,
              error: null,
            });
          }
        } catch (err: any) {
          console.error('Auth initialization error:', err);
          set({
            error: err.message || 'Authentication failed',
            isAuthenticated: false,
          });
        } finally {
          set({ isLoading: false });
        }
      },

      login: async (piUid?: string) => {
        try {
          set({ isLoading: true, error: null });

          if (!window.Pi) {
            throw new Error('Pi SDK not available');
          }

          // Trigger Pi authentication
          const authResult = await window.Pi.authenticate();

          if (!authResult?.user) {
            throw new Error('Authentication failed');
          }

          const piUser: User = {
            pi_uid: authResult.user.uid,
            username: authResult.user.username || `User_${authResult.user.uid.slice(0, 8)}`,
            user_id: authResult.user.uid,
          };

          // Sync with backend
          const response = await apiClient.post('/api/users/sync', {
            pi_uid: piUser.pi_uid,
            username: piUser.username,
          });

          if (response.data?.data) {
            piUser.user_id = response.data.data.user_id;
            piUser.sanctuary_id = response.data.data.sanctuary_id;
            piUser.created_at = response.data.data.created_at;
          }

          set({
            user: piUser,
            isAuthenticated: true,
            error: null,
          });
        } catch (err: any) {
          const errorMsg = err.message || 'Login failed';
          set({
            error: errorMsg,
            isAuthenticated: false,
          });
          throw err;
        } finally {
          set({ isLoading: false });
        }
      },

      logout: async () => {
        try {
          set({ isLoading: true });

          if (window.Pi?.logout) {
            await window.Pi.logout();
          }

          set({
            user: null,
            isAuthenticated: false,
            error: null,
          });
        } catch (err: any) {
          console.error('Logout error:', err);
          set({ error: err.message });
        } finally {
          set({ isLoading: false });
        }
      },

      setError: (error: string | null) => {
        set({ error });
      },
    }),
    {
      name: 'pi-universe-auth',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
