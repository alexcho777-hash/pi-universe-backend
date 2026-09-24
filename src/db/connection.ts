import * as mysql from 'mysql2/promise';
import { Pool, Connection } from 'mysql2/promise';

let pool: Pool;

export async function initializeDatabase(): Promise<void> {
  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'pi_universe',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  // Test connection
  try {
    const connection = await pool.getConnection();
    console.log('✓ Database connection successful');
    connection.release();
  } catch (error) {
    console.error('✗ Database connection failed:', error);
    throw error;
  }
}

export function getPool(): Pool {
  if (!pool) {
    throw new Error('Database pool not initialized. Call initializeDatabase() first.');
  }
  return pool;
}

export async function executeQuery<T>(
  query: string,
  params: any[] = []
): Promise<T[]> {
  const connection = await getPool().getConnection();
  try {
    const [rows] = await connection.execute(query, params);
    return rows as T[];
  } finally {
    connection.release();
  }
}

export async function executeInsert(
  query: string,
  params: any[] = []
): Promise<{ insertId: number; affectedRows: number }> {
  const connection = await getPool().getConnection();
  try {
    const [result] = await connection.execute(query, params);
    const insertResult = result as any;
    return {
      insertId: insertResult.insertId || 0,
      affectedRows: insertResult.affectedRows || 0,
    };
  } finally {
    connection.release();
  }
}

export async function executeUpdate(
  query: string,
  params: any[] = []
): Promise<number> {
  const connection = await getPool().getConnection();
  try {
    const [result] = await connection.execute(query, params);
    const updateResult = result as any;
    return updateResult.affectedRows || 0;
  } finally {
    connection.release();
  }
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    console.log('Database pool closed');
  }
}
