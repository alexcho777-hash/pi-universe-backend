/**
 * App-to-User (A2U) payments: the app wallet sends Pi to one user.
 * Docs: https://github.com/pi-apps/pi-platform-docs (Payments → App-to-User)
 *
 * Flow:
 *  1. POST /v2/payments            create the payment (server API key)  -> identifier
 *  2. GET  /v2/payments/:id        read the user's wallet address (to_address)
 *  3. Build, sign and submit the Stellar transaction from the app wallet
 *  4. POST /v2/payments/:id/complete { txid }
 *
 * Environment variables (set on Render, never in code):
 *   PI_API_KEY            the Pi Developer Portal API key of THIS network's app
 *   PI_APP_WALLET_SECRET  the app wallet secret seed (starts with S). Keep it private!
 *   PI_NETWORK            'testnet' (default) or 'mainnet'
 */

import { Keypair, Horizon, TransactionBuilder, Operation, Asset, Memo, BASE_FEE } from '@stellar/stellar-sdk';
import { PiPlatform, PiPayment, PiApiError } from './PiPlatform';

const API_BASE = process.env.PI_API_BASE || 'https://api.minepi.com/v2';

function network() {
  const mainnet = String(process.env.PI_NETWORK || 'testnet').toLowerCase() === 'mainnet';
  return mainnet
    ? { horizon: 'https://api.mainnet.minepi.com', passphrase: 'Pi Network' }
    : { horizon: 'https://api.testnet.minepi.com', passphrase: 'Pi Testnet' };
}

async function piPost(path: string, body: any): Promise<any> {
  const apiKey = process.env.PI_API_KEY;
  if (!apiKey) throw new PiApiError('PI_API_KEY is not set on the server', 500, null);
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Key ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && (data.error_message || data.error || data.message)) || `Pi API ${res.status}`;
    throw new PiApiError(String(msg), res.status, data);
  }
  return data;
}

export function a2uConfigured(): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!process.env.PI_API_KEY) missing.push('PI_API_KEY');
  if (!process.env.PI_APP_WALLET_SECRET) missing.push('PI_APP_WALLET_SECRET');
  return { ok: missing.length === 0, missing };
}

export interface A2UResult {
  paymentId: string;
  txid: string | null;
  toAddress: string | null;
  stage: 'created' | 'submitted' | 'completed';
}

/** Step 1 only: create the payment on the Pi side. */
export async function createA2U(uid: string, amount: number, memo: string, metadata: any): Promise<PiPayment> {
  return piPost('/payments', { payment: { amount, memo, metadata, uid } });
}

/** Steps 2-3: send the Stellar transaction for an existing A2U payment. Returns the txid. */
export async function submitA2U(paymentId: string): Promise<{ txid: string; payment: PiPayment }> {
  const secret = process.env.PI_APP_WALLET_SECRET;
  if (!secret) throw new PiApiError('PI_APP_WALLET_SECRET is not set on the server', 500, null);

  const payment = await PiPlatform.getPayment(paymentId);
  const toAddress = payment.to_address;
  if (!toAddress) throw new PiApiError('The payment has no destination wallet yet', 502, payment);

  const net = network();
  const server = new Horizon.Server(net.horizon);
  const keypair = Keypair.fromSecret(secret);
  const account = await server.loadAccount(keypair.publicKey());

  let baseFee = BASE_FEE;
  try { baseFee = String(await server.fetchBaseFee()); } catch { /* keep default */ }

  const tx = new TransactionBuilder(account, { fee: baseFee, networkPassphrase: net.passphrase, timebounds: await server.fetchTimebounds(180) })
    .addOperation(Operation.payment({ destination: toAddress, asset: Asset.native(), amount: String(payment.amount) }))
    .addMemo(Memo.text(paymentId))
    .build();
  tx.sign(keypair);

  const sent: any = await server.submitTransaction(tx);
  const txid = sent && (sent.hash || sent.id);
  if (!txid) throw new PiApiError('Stellar did not return a transaction id', 502, sent);
  return { txid: String(txid), payment };
}

/** Step 4: tell Pi the payment is done. */
export function completeA2U(paymentId: string, txid: string): Promise<PiPayment> {
  return PiPlatform.completePayment(paymentId, txid);
}
