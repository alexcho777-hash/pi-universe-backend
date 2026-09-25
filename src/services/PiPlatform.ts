/**
 * Pi Platform API client (server side)
 * Docs: https://github.com/pi-apps/pi-platform-docs
 *
 * Requires the PI_API_KEY environment variable (from the Pi Developer Portal → API Key).
 * Never expose this key to the frontend.
 */

const PI_API_BASE = process.env.PI_API_BASE || 'https://api.minepi.com/v2';

export class PiApiError extends Error {
  status: number;
  body: any;
  constructor(message: string, status: number, body: any) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function piRequest(method: 'GET' | 'POST', path: string, body?: any, authHeader?: string): Promise<any> {
  const apiKey = process.env.PI_API_KEY;
  if (!authHeader && !apiKey) {
    throw new PiApiError('PI_API_KEY is not set on the server', 500, null);
  }

  const res = await fetch(`${PI_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: authHeader || `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const msg = (data && (data.error_message || data.error || data.message)) || `Pi API ${res.status}`;
    throw new PiApiError(String(msg), res.status, data);
  }
  return data;
}

export interface PiPayment {
  identifier: string;
  user_uid: string;
  amount: number;
  memo: string;
  metadata: any;
  to_address?: string;
  created_at?: string;
  network?: string;
  status: {
    developer_approved: boolean;
    transaction_verified: boolean;
    developer_completed: boolean;
    cancelled: boolean;
    user_cancelled: boolean;
  };
  transaction: null | { txid: string; verified: boolean; _link: string };
}

export const PiPlatform = {
  getPayment: (paymentId: string): Promise<PiPayment> =>
    piRequest('GET', `/payments/${encodeURIComponent(paymentId)}`),

  approvePayment: (paymentId: string): Promise<PiPayment> =>
    piRequest('POST', `/payments/${encodeURIComponent(paymentId)}/approve`),

  completePayment: (paymentId: string, txid: string): Promise<PiPayment> =>
    piRequest('POST', `/payments/${encodeURIComponent(paymentId)}/complete`, { txid }),

  cancelPayment: (paymentId: string): Promise<PiPayment> =>
    piRequest('POST', `/payments/${encodeURIComponent(paymentId)}/cancel`),

  /** Verify a Pi access token and return the Pi user it belongs to. */
  me: (accessToken: string): Promise<{ uid: string; username: string }> =>
    piRequest('GET', '/me', undefined, `Bearer ${accessToken}`),
};
