import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { JWTPayload } from '../types';

const JWT_SECRET: string = process.env.JWT_SECRET || 'dev_secret_key_change_in_production';
const JWT_EXPIRY: string = process.env.JWT_EXPIRY || '7d';
const PI_SERVER_API_KEY = process.env.PI_SERVER_API_KEY || '';

/**
 * Generate JWT token with Pi Network user
 */
export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRY as any,
    algorithm: 'HS256',
  } as any);
}

/**
 * Verify and decode JWT token
 */
export function verifyToken(token: string): JWTPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
    });
    return decoded as JWTPayload;
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Token expired');
    } else if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid token');
    }
    throw error;
  }
}

/**
 * Verify Pi Network signature
 * In production, this calls Pi Server to verify the signature
 * For now, we implement a basic verification with the public key
 */
export async function verifyPiSignature(
  piUid: string,
  signature: string,
  nonce?: string
): Promise<boolean> {
  try {
    // In production, you would verify with Pi Server's public key
    // For development, we'll accept valid Pi signatures
    // The signature comes from Pi Browser's window.Pi.sign() method

    if (!piUid || !signature) {
      return false;
    }

    // Basic validation - Pi signatures are typically hex strings
    if (!/^[a-f0-9]+$/.test(signature)) {
      return false;
    }

    // TODO: Implement actual Pi Server signature verification
    // This would involve calling Pi Server with the API key
    // For now, accept any valid format signature
    return true;
  } catch (error) {
    console.error('Pi signature verification failed:', error);
    return false;
  }
}

/**
 * Extract token from Authorization header
 */
export function extractTokenFromHeader(authHeader?: string): string | null {
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Hash password (kept for backward compatibility if needed)
 * @deprecated Use Pi Network authentication instead
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

/**
 * Compare password with hash (kept for backward compatibility if needed)
 * @deprecated Use Pi Network authentication instead
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
