import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config/index';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import gameRoutes from './routes/game.routes';
import aarRoutes from './routes/aar.routes';
import progressionRoutes from './routes/progression.routes';

export function createApp(): express.Application {
  const app = express();

  // Security middleware
  app.use(helmet());

  // CORS configuration
  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true,
      optionsSuccessStatus: 200,
    })
  );

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
  });

  // Apply rate limit to all routes
  app.use(limiter);

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API version
  app.get('/api/version', (req, res) => {
    res.json({ version: '1.0.0' });
  });

  // Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/games', gameRoutes);
  app.use('/api/aar', aarRoutes);
  app.use('/api/progression', progressionRoutes);

  // Error handling middleware
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('[Error]', err);

    const status = err.status || err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    res.status(status).json({
      error: {
        status,
        message,
      },
    });
  });

  return app;
}

export default createApp;
