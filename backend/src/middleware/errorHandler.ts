/**
 * Centralized Error Handling Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { env } from '../config/env';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const isProd = env.NODE_ENV === 'production';

  if (err instanceof AppError) {
    logger.warn(`AppError [${err.errorCode}]: ${err.message} on ${req.method} ${req.originalUrl}`);
    res.status(err.statusCode).json({
      error: {
        code: err.errorCode,
        message: err.message,
        details: err.details || null
      }
    });
    return;
  }

  // Handle unexpected errors safely
  logger.error(`Unhandled Internal Error on ${req.method} ${req.originalUrl}`, err);

  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: isProd ? 'An unexpected internal server error occurred.' : err.message,
      stack: isProd ? undefined : err.stack
    }
  });
}
