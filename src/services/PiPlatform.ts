/**
 * Pi Platform API client (server side)
 * Docs: https://github.com/pi-apps/pi-platform-docs
 *
 * Needs the API key(s) of the Pi app(s) from the Pi Developer Portal (see apiKeys() below).
 * Never expose these keys to the frontend.
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

/**
 * API keys, tried in this order. Each Pi app (mainnet, testnet) has its own key, and Pi only lets a
 * key act on payments created by its own app: any other key gets 404 "payment_not_found". So one
 * server can serve both sites — a payment call is tried with each configured key until one owns it,
 * and the key that worked is remembered for that payment (approve -> complete -> cancel).
 *
 *   PI_API_KEY_MAINNET   key of the Mainnet app
 *   PI_API_KEY_TESTNET   key of the Testnet app
 *   PI_API_KEY           legacy single key (still used if the two above are not set)
 */
const apiKeys = (): string[] => {
  const list = [process.env.PI_API_KEY_MAINNET, process.env.PI_API_KEY_TESTNET, process.env.PI_API_KEY]
    .map((k) => (k || '').trim())
    .filter(Boolean);
  return Array.from(new Set(list));
};

const keyForPayment = new Map<string, string>();
const rememberKey = (paymentId: string, key: string) => {
  keyForPayment.set(paymentId, key);
  if (keyForPayment.size > 500) keyForPayment.delete(keyForPayment.keys().next().value as string);
};

async function rawRequest(method: 'GET' | 'POST', path: string, authorization: string, body?: any): Promise<any> {
  const res = await fetch(`${PI_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: authorization,
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

const isNotFound = (e: any) =>
  e instanceof PiApiError && (e.status === 404 || (e.body && e.body.error === 'payment_not_found'));

/** A call that acts on one payment: find the key (app) that owns it. */
async function paymentRequest(method: 'GET' | 'POST', paymentId: string, suffix: string, body?: any): Promise<any> {
  const keys = apiKeys();
  if (keys.length === 0) throw new PiApiError('No Pi API key is set on the server (PI_API_KEY_MAINNET / PI_API_KEY_TESTNET / PI_API_KEY)', 500, null);

  const known = keyForPayment.get(paymentId);
  const order = known ? [known, ...keys.filter((k) => k !== known)] : keys;
  const path = `/payments/${encodeURIComponent(paymentId)}${suffix}`;

  let lastErr: any = null;
  for (const key of order) {
    try {
      const data = await rawRequest(method, path, `Key ${key}`, body);
      rememberKey(paymentId, key);
      return data;
    } catch (e) {
      lastErr = e;
      if (!isNotFound(e)) throw e; // a real error (already approved, bad txid ...): do not try other keys
    }
  }
  throw lastErr;
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
  getPayment: (paymentId: string): Promise<PiPayment> => paymentRequest('GET', paymentId, ''),

  approvePayment: (paymentId: string): Promise<PiPayment> => paymentRequest('POST', paymentId, '/approve'),

  completePayment: (paymentId: string, txid: string): Promise<PiPayment> =>
    paymentRequest('POST', paymentId, '/complete', { txid }),

  cancelPayment: (paymentId: string): Promise<PiPayment> => paymentRequest('POST', paymentId, '/cancel'),

  /** Verify a Pi access token and return the Pi user it belongs to (uses the user's own token, no API key). */
  me: (accessToken: string): Promise<{ uid: string; username: string }> =>
    rawRequest('GET', '/me', `Bearer ${accessToken}`),
};
