import { Pool, QueryResult } from 'pg';

let pool: Pool;

/**
 * Convert MySQL-style "?" placeholders into PostgreSQL "$1, $2, ..." placeholders.
 * This lets the rest of the codebase keep writing `WHERE id = ?` style queries.
 */
function toPgQuery(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

/**
 * A mysql2-compatible shim around node-postgres so existing route/service code
 * (written against mysql2's `pool.execute()` -> `[rows]` / `[{ insertId, affectedRows }]`)
 * keeps working unchanged.
 */
interface CompatPool {
  execute(sql: string, params?: any[]): Promise<[any, any]>;
  getConnection(): Promise<{ release: () => void }>;
}

function buildCompatPool(pgPool: Pool): CompatPool {
  return {
    async getConnection() {
      const client = await pgPool.connect();
      return {
        release: () => client.release(),
      };
    },
    async execute(sql: string, params: any[] = []): Promise<[any, any]> {
      const pgSql = toPgQuery(sql);
      const trimmed = sql.trim().toLowerCase();

      if (trimmed.startsWith('select') || trimmed.startsWith('show') || trimmed.startsWith('with')) {
        const result: QueryResult = await pgPool.query(pgSql, params);
        return [result.rows, result.fields];
      }

      if (trimmed.startsWith('insert')) {
        const hasReturning = /returning/i.test(pgSql);
        const finalSql = hasReturning ? pgSql : `${pgSql.replace(/;\s*$/, '')} RETURNING id`;
        try {
          const result: QueryResult = await pgPool.query(finalSql, params);
          const insertId = result.rows && result.rows[0] ? result.rows[0].id : 0;
          return [{ insertId: insertId || 0, affectedRows: result.rowCount || 0 }, undefined];
        } catch (err: any) {
          // Table has no "id" column (e.g. a UUID-keyed table) - retry without RETURNING id
          if (!hasReturning && /column "id" does not exist/i.test(err.message)) {
            const result: QueryResult = await pgPool.query(pgSql, params);
            return [{ insertId: 0, affectedRows: result.rowCount || 0 }, undefined];
          }
          throw err;
        }
      }

      // UPDATE / DELETE / DDL / everything else
      const result: QueryResult = await pgPool.query(pgSql, params);
      return [{ affectedRows: result.rowCount || 0 }, undefined];
    },
  };
}

let compatPool: CompatPool;

export async function initializeDatabase(): Promise<void> {
  // Prefer a single connection string (e.g. Render's "Internal Database URL")
  // when provided; otherwise fall back to individual DB_HOST/DB_USER/... vars.
  const connectionString = process.env.DATABASE_URL;
  const isLocal = !connectionString && (process.env.DB_HOST || 'localhost').includes('localhost');

  pool = connectionString
    ? new Pool({
        connectionString,
        max: 10,
        ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
      })
    : new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'pi_universe',
        max: 10,
        ssl: isLocal ? false : { rejectUnauthorized: false },
      });

  compatPool = buildCompatPool(pool);

  // Test connection
  try {
    const client = await pool.connect();
    console.log('✓ Database connection successful');
    client.release();
  } catch (error) {
    console.error('✗ Database connection failed:', error);
    throw error;
  }
}

export function getPool(): CompatPool {
  if (!compatPool) {
    throw new Error('Database pool not initialized. Call initializeDatabase() first.');
  }
  return compatPool;
}

export async function executeQuery<T>(
  query: string,
  params: any[] = []
): Promise<T[]> {
  const [rows] = await getPool().execute(query, params);
  return rows as T[];
}

export async function executeInsert(
  query: string,
  params: any[] = []
): Promise<{ insertId: number; affectedRows: number }> {
  const [result] = await getPool().execute(query, params);
  const insertResult = result as any;
  return {
    insertId: insertResult.insertId || 0,
    affectedRows: insertResult.affectedRows || 0,
  };
}

export async function executeUpdate(
  query: string,
  params: any[] = []
): Promise<number> {
  const [result] = await getPool().execute(query, params);
  const updateResult = result as any;
  return updateResult.affectedRows || 0;
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    console.log('Database pool closed');
  }
}
