/**
 * GridPilot Custom Error Hierarchy
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly isOperational: boolean;
  public readonly details?: any;

  constructor(message: string, statusCode = 500, errorCode = 'INTERNAL_SERVER_ERROR', details?: any) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = true;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class EngineUnavailableError extends AppError {
  constructor(message = 'Optimization/simulation engine is currently unreachable') {
    super(message, 503, 'ENGINE_UNAVAILABLE');
  }
}

export class EngineTimeoutError extends AppError {
  constructor(message = 'Optimization engine timed out while solving dispatch') {
    super(message, 504, 'ENGINE_TIMEOUT');
  }
}

export class EngineResponseError extends AppError {
  constructor(message = 'Optimization engine returned an invalid response', details?: any) {
    super(message, 502, 'ENGINE_BAD_GATEWAY', details);
  }
}

export class LLMUnavailableError extends AppError {
  constructor(message = 'LLM explanation service is currently unavailable') {
    super(message, 503, 'LLM_UNAVAILABLE');
  }
}
