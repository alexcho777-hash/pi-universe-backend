import { Response } from 'express';
import { ApiResponse } from '../types';

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public errorCode: string,
    public message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Send standardized error response
 */
export function sendErrorResponse(
  res: Response,
  statusCode: number,
  errorCode: string,
  message: string,
  details?: any
): void {
  const response: ApiResponse = {
    success: false,
    error: message,
    error_code: errorCode,
    timestamp: new Date().toISOString(),
  };

  if (details) {
    response.details = details;
  }

  res.status(statusCode).json(response);
}

/**
 * Send standardized success response
 */
export function sendSuccessResponse(res: Response, statusCode: number, data: any): void {
  const response: ApiResponse = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };

  res.status(statusCode).json(response);
}

/**
 * Common error codes
 */
export const ErrorCodes = {
  // Authentication
  MISSING_TOKEN: 'MISSING_TOKEN',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  UNAUTHORIZED: 'UNAUTHORIZED',

  // Authorization
  FORBIDDEN: 'FORBIDDEN',
  FORBIDDEN_CROSS_SANCTUARY: 'FORBIDDEN_CROSS_SANCTUARY',

  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',

  // User errors
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  USER_ALREADY_EXISTS: 'USER_ALREADY_EXISTS',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',

  // Wallet errors
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  WALLET_NOT_FOUND: 'WALLET_NOT_FOUND',

  // Activity errors
  ACTIVITY_NOT_FOUND: 'ACTIVITY_NOT_FOUND',
  ALREADY_ATTENDED: 'ALREADY_ATTENDED',
  ACTIVITY_FULL: 'ACTIVITY_FULL',

  // Shop errors
  ITEM_NOT_FOUND: 'ITEM_NOT_FOUND',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
  QUANTITY_LIMIT_EXCEEDED: 'QUANTITY_LIMIT_EXCEEDED',

  // General
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
};

/**
 * Common HTTP Status Codes
 */
export const StatusCodes = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
};
