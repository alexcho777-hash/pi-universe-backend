import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { initializeDatabase, closeDatabase } from './db/connection';
import { initializeSchema } from './db/initialize';
import { authMiddleware, sanctuaryIsolationMiddleware } from './middleware/auth';
import { sendErrorResponse, StatusCodes, ErrorCodes } from './utils/errors';

// Import routes
import authRoutes from './routes/auth';
import usersRoutes from './routes/users';
import activitiesRoutes from './routes/activities';
import sanctuariesRoutes from './routes/sanctuaries';
import acknowledgementsRoutes from './routes/acknowledgments';
import donationsRoutes from './routes/donations';
import paymentsRoutes from './routes/payments';
import practiceRoutes from './routes/practice';
import meritRoutes from './routes/merit';
import oracleRoutes from './routes/oracle';
import boardRoutes from './routes/board';
import lampsRoutes from './routes/lamps';
import memorialsRoutes from './routes/memorials';
import wishesRoutes from './routes/wishes';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../public')));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/sanctuaries', sanctuariesRoutes);
app.use('/api/acknowledgments', acknowledgementsRoutes);
app.use('/api/donations', donationsRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/practice', practiceRoutes);
app.use('/api/merit', meritRoutes);
app.use('/api/oracle', oracleRoutes);
app.use('/api/board', boardRoutes);
app.use('/api/lamps', lampsRoutes);
app.use('/api/memorials', memorialsRoutes);
app.use('/api/wishes', wishesRoutes);
app.use('/api/activities', authMiddleware, sanctuaryIsolationMiddleware, activitiesRoutes);

// Serve index.html for all non-API routes (SPA support)
app.get('*', (req, res) => {
  // Check if this is an API request that wasn't matched
  if (req.path.startsWith('/api')) {
    return res.status(404).json({
      success: false,
      error: '请求的端点不存在',
      error_code: 'NOT_FOUND'
    });
  }
  // This service is API-only; the web app is deployed separately (pi-universe-web).
  res.json({ service: 'π Universe API', status: 'OK', health: '/health' });
});

// 404 handler (unreachable but kept for completeness)
app.use((req, res) => {
  sendErrorResponse(
    res,
    StatusCodes.NOT_FOUND,
    ErrorCodes.NOT_FOUND,
    '请求的端点不存在'
  );
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  sendErrorResponse(
    res,
    StatusCodes.INTERNAL_SERVER_ERROR,
    ErrorCodes.INTERNAL_ERROR,
    '内部服务器错误'
  );
});

/**
 * Start server
 */
async function startServer() {
  try {
    // Initialize database connection
    await initializeDatabase();
    console.log('✓ Database connection established');

    // Initialize database schema
    await initializeSchema();
    console.log('✓ Database schema initialized');

    // Start listening
    app.listen(PORT, () => {
      console.log(`
╔════════════════════════════════════════╗
║     π Universe - API Server Started    ║
╚════════════════════════════════════════╝

🚀 Server: http://localhost:${PORT}
📊 API Documentation: /api/docs (coming soon)
🏯 Buddhist Sanctuary: Ready

Key Endpoints:
  POST   /api/auth/register         - 用户注册
  POST   /api/auth/login            - 用户登陆
  GET    /api/wallets/current       - 获取钱包信息
  POST   /api/activities/daily-checkin  - 敲钟打卡
  GET    /api/activities            - 获取活动列表
  GET    /api/shop                  - 浏览商店
  POST   /api/shop/:item_id/purchase - 购买物品

⚠️  Environment: ${process.env.NODE_ENV || 'development'}
🔐 Database: ${process.env.DATABASE_URL ? 'DATABASE_URL' : `${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`}
🔑 PI_API_KEY: ${process.env.PI_API_KEY ? 'set' : 'MISSING'}
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await closeDatabase();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await closeDatabase();
  process.exit(0);
});

// Start the server
startServer().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

export default app;
