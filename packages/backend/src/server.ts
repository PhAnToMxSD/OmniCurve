import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { config } from './config';
import healthRoutes from './routes/health';
import marketRoutes from './routes/marketRoutes';
import webhookRoutes from './webhooks/goldskyHandler';
import { errorHandler } from './middlewares/errorHandler';
import { initializeSocket } from './sockets/socketManager';
import { startChainWatcher } from './services/chainService';

const app = express();

// Middlewares
app.use(helmet());
app.use(cors());

// Capture raw body for signature verification
app.use(express.json({
  verify: (req: any, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api', healthRoutes);
app.use('/api/markets', marketRoutes);
app.use('/api/webhooks', webhookRoutes);

// Global Error Handler
app.use(errorHandler);

const httpServer = createServer(app);
initializeSocket(httpServer);

// Store unwatch functions for graceful shutdown
let unwatchers: (() => void)[] = [];

httpServer.listen(config.PORT, () => {
  console.log(`Server is running on port ${config.PORT}`);

  // Start the on-chain event watcher
  startChainWatcher()
    .then((fns) => {
      unwatchers = fns;
      console.log('⛓️  Chain watcher started successfully');
    })
    .catch((err) => {
      console.error('⚠️  Chain watcher failed to start:', err);
    });
});

// Graceful shutdown
const shutdown = () => {
  console.log('\n🛑 Shutting down...');
  unwatchers.forEach((unwatch) => unwatch());
  httpServer.close(() => process.exit(0));
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
