import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

interface ErrorWithStatus extends Error {
  status?: number;
  statusCode?: number;
}

export const errorHandler = (
  error: ErrorWithStatus,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  logger.error('Error occurred:', {
    message: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
  });

  const status = error.status || error.statusCode || 500;
  const message = error.message || 'Internal server error';

  // Don't expose internal errors in production
  const responseMessage = status === 500 && process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : message;

  res.status(status).json({
    error: responseMessage,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
  });
};

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};