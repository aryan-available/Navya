/**
 * GridPilot Backend Entrypoint (Node.js + Express + TypeScript)
 * Member B - API Gateway, Orchestrator, Auth, Persistence, and Real-Time Push.
 */

import http from 'http';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { connectDB } from './config/db';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { liveStateBroadcaster } from './sockets/liveState';
import { orchestrator } from './services/orchestrator';

// Route imports
import authRoutes from './routes/auth';
import signalRoutes from './routes/signal';
import microgridRoutes from './routes/microgrid';
import forecastRoutes from './routes/forecast';
import optimizeRoutes from './routes/optimize';
import scenarioRoutes from './routes/scenario';
import overrideRoutes from './routes/override';
import explainRoutes from './routes/explain';
import ladderRoutes from './routes/ladder';
import runwayRoutes from './routes/runway';

export const app = express();
export const server = http.createServer(app);

// 1. Security & Core Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
  })
);
app.use(express.json({ limit: '5mb' }));

// Request logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (req.originalUrl !== '/health' && req.originalUrl !== '/signal') {
    logger.debug(`${req.method} ${req.originalUrl}`);
  }
  next();
});

// 2. Health & Diagnostic Endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'UP',
    service: 'gridpilot-backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    mock_engine_active: env.USE_MOCK_ENGINE,
    environment: env.NODE_ENV
  });
});

// 3. Public Routes (No Authentication Required)
app.use('/auth', authRoutes);
app.use('/signal', signalRoutes);

// 4. Protected Microgrid API Routes
app.use('/api/microgrid', microgridRoutes);
app.use('/api/forecast', forecastRoutes);
app.use('/api/optimize', optimizeRoutes);
app.use('/api/scenario', scenarioRoutes);
app.use('/api/override', overrideRoutes);
app.use('/api/explain', explainRoutes);
app.use('/api/ladder', ladderRoutes);
app.use('/api/runway', runwayRoutes);

// 5. 404 Route Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route not found: ${req.method} ${req.originalUrl}`
    }
  });
});

// 6. Centralized Error Handler Middleware
app.use(errorHandler);

// 7. Server Initialization
export async function startServer(): Promise<http.Server> {
  // Initialize Socket.IO
  liveStateBroadcaster.init(server);

  // Connect Database (Atlas / Local)
  if (process.env.NODE_ENV !== 'test') {
    await connectDB();
  }

  // Start Autonomous Orchestrator Loop if enabled
  if (env.ORCHESTRATOR_AUTO_START && process.env.NODE_ENV !== 'test') {
    orchestrator.start(env.ORCHESTRATOR_TICK_MS);
  }

  const port = env.PORT;
  return new Promise((resolve) => {
    server.listen(port, () => {
      logger.info(`=======================================================`);
      logger.info(`  GRIDPILOT BACKEND (MEMBER B) READY`);
      logger.info(`  REST API listening on: http://localhost:${port}`);
      logger.info(`  WebSocket ready on:   ws://localhost:${port}`);
      logger.info(`  Public Signal:        http://localhost:${port}/signal`);
      logger.info(`  Mock Engine Mode:     ${env.USE_MOCK_ENGINE ? 'ENABLED' : 'DISABLED'}`);
      logger.info(`=======================================================`);
      resolve(server);
    });
  });
}

// Auto-start when run directly
if (require.main === module) {
  startServer().catch((err) => {
    logger.error('Fatal failure starting GridPilot Backend', err);
    process.exit(1);
  });
}
