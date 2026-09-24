/**
 * Hook for Pi Network Payments
 */

import { useState, useCallback } from 'react';
import { apiClient } from '../api/ApiClient';

declare global {
  interface Window {
    Pi?: any;
  }
}

interface PaymentConfig {
  amount: number;
  sanctuaryId: number;
  description: string;
}

export const usePiPayment = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createPayment = useCallback(
    async (config: PaymentConfig) => {
      try {
        setIsLoading(true);
        setError(null);

        if (!window.Pi) {
          throw new Error('Pi SDK not available');
        }

        // Step 1: Create payment on backend
        const createResponse = await apiClient.createPayment(
          config.amount,
          config.sanctuaryId,
          config.description
        );

        if (!createResponse.success || !createResponse.data) {
          throw new Error(createResponse.error || 'Failed to create payment');
        }

        const backendPayment = createResponse.data as any;
        const paymentId = backendPayment.payment_id || backendPayment.id;

        // Step 2: Open Pi payment dialog
        const piPaymentConfig = {
          amount: config.amount,
          memo: config.description,
          metadata: {
            payment_id: paymentId,
            sanctuary_id: config.sanctuaryId,
          },
        };

        // Trigger Pi payment UI
        // Note: This assumes window.Pi.payment() exists
        const piPayment = await window.Pi.payment?.(piPaymentConfig);

        if (!piPayment) {
          throw new Error('Payment cancelled by user');
        }

        // Step 3: Complete payment on backend
        const completeResponse = await apiClient.completePayment(paymentId);

        if (!completeResponse.success) {
          throw new Error(completeResponse.error || 'Failed to complete payment');
        }

        return completeResponse.data;
      } catch (err: any) {
        const errorMsg = err.message || 'Payment failed';
        setError(errorMsg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  return {
    isLoading,
    error,
    createPayment,
  };
};
