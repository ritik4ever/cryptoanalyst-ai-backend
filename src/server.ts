import { config } from './utils/config.js';
import { logger } from './utils/logger.js';
import app from './app.js';

const startServer = async () => {
  try {
    const server = app.listen(config.port, () => {
      logger.info(`🚀 Server running on port ${config.port}`);
      logger.info(`🔗 Environment: ${config.nodeEnv}`);
      logger.info(`🎯 Ready for hackathon demo!`);
      logger.info(`📍 Health check: http://localhost:${config.port}/health`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully');
      server.close(() => {
        logger.info('Process terminated');
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();