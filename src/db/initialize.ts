/**
 * Database Initialization
 * Creates all tables for multi-sanctuary platform
 */

import { getPool } from './connection';
import * as fs from 'fs';
import * as path from 'path';

export async function initializeSchema(): Promise<void> {
  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    // Split SQL statements and execute each one
    const statements = schema
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);

    const pool = getPool();

    for (const statement of statements) {
      try {
        await pool.execute(statement);
        console.log(`✓ Executed: ${statement.substring(0, 50)}...`);
      } catch (error: any) {
        // Ignore "table already exists" errors
        if (error.code === 'ER_TABLE_EXISTS_ERROR' || error.message.includes('already exists')) {
          console.log(`⚠ Table already exists: ${statement.substring(0, 50)}...`);
        } else {
          throw error;
        }
      }
    }

    console.log('✓ Database schema initialized successfully');
  } catch (error) {
    console.error('✗ Failed to initialize database schema:', error);
    throw error;
  }
}

/**
 * Get all sanctuaries
 */
export async function getSanctuaries(): Promise<any[]> {
  try {
    const [rows] = await getPool().execute(
      'SELECT * FROM sanctuaries WHERE is_active = TRUE ORDER BY id'
    );
    return rows as any[];
  } catch (error) {
    console.error('Failed to get sanctuaries:', error);
    return [];
  }
}

/**
 * Get sanctuary by ID
 */
export async function getSanctuaryById(id: number): Promise<any | null> {
  try {
    const [rows] = await getPool().execute(
      'SELECT * FROM sanctuaries WHERE id = ? AND is_active = TRUE',
      [id]
    );
    const results = rows as any[];
    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error('Failed to get sanctuary:', error);
    return null;
  }
}

/**
 * Get sanctuary by religion type
 */
export async function getSanctuaryByReligion(religionType: string): Promise<any | null> {
  try {
    const [rows] = await getPool().execute(
      'SELECT * FROM sanctuaries WHERE religion_type = ? AND is_active = TRUE',
      [religionType]
    );
    const results = rows as any[];
    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error('Failed to get sanctuary by religion:', error);
    return null;
  }
}

/**
 * Get zones for a sanctuary
 */
export async function getSanctuaryZones(sanctuaryId: number): Promise<any[]> {
  try {
    const [rows] = await getPool().execute(
      'SELECT * FROM sanctuary_zones WHERE sanctuary_id = ? ORDER BY name',
      [sanctuaryId]
    );
    return rows as any[];
  } catch (error) {
    console.error('Failed to get sanctuary zones:', error);
    return [];
  }
}

/**
 * Create user sanctuary membership
 */
export async function createUserSanctuary(
  userId: number,
  sanctuaryId: number,
  isPrimary: boolean = false
): Promise<boolean> {
  try {
    await getPool().execute(
      'INSERT IGNORE INTO user_sanctuaries (user_id, sanctuary_id, is_primary) VALUES (?, ?, ?)',
      [userId, sanctuaryId, isPrimary]
    );
    return true;
  } catch (error) {
    console.error('Failed to create user sanctuary:', error);
    return false;
  }
}

/**
 * Get user sanctuaries
 */
export async function getUserSanctuaries(userId: number): Promise<any[]> {
  try {
    const [rows] = await getPool().execute(
      `SELECT s.*, us.joined_at, us.visit_count, us.is_primary
       FROM sanctuaries s
       JOIN user_sanctuaries us ON s.id = us.sanctuary_id
       WHERE us.user_id = ? AND s.is_active = TRUE
       ORDER BY us.is_primary DESC, us.joined_at DESC`,
      [userId]
    );
    return rows as any[];
  } catch (error) {
    console.error('Failed to get user sanctuaries:', error);
    return [];
  }
}

/**
 * Update user primary sanctuary
 */
export async function setUserPrimarySanctuary(
  userId: number,
  sanctuaryId: number
): Promise<boolean> {
  try {
    // First, reset all to false
    await getPool().execute(
      'UPDATE user_sanctuaries SET is_primary = FALSE WHERE user_id = ?',
      [userId]
    );

    // Then set the new primary
    await getPool().execute(
      'UPDATE user_sanctuaries SET is_primary = TRUE WHERE user_id = ? AND sanctuary_id = ?',
      [userId, sanctuaryId]
    );

    // Update user's current_sanctuary_id
    await getPool().execute(
      'UPDATE users SET current_sanctuary_id = ? WHERE id = ?',
      [sanctuaryId, userId]
    );

    return true;
  } catch (error) {
    console.error('Failed to set user primary sanctuary:', error);
    return false;
  }
}
