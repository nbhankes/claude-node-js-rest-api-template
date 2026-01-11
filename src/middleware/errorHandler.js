/**
 * =============================================================================
 * ERROR HANDLING MIDDLEWARE
 * =============================================================================
 *
 * This module provides centralized error handling for the Express application.
 * Proper error handling is essential for security, debugging, and user experience.
 *
 * BEST PRACTICES DEMONSTRATED:
 * - Centralized error handling
 * - Environment-aware error responses (dev vs production)
 * - Custom error classes for different error types
 * - Logging for debugging and monitoring
 * - Secure error messages (no sensitive data in production)
 *
 * =============================================================================
 */

const { config } = require('../config');

/**
 * Custom error class for API errors.
 * Extends the built-in Error class with HTTP status code and additional data.
 *
 * Usage:
 *   throw new ApiError(404, 'Resource not found');
 *   throw new ApiError(400, 'Invalid input', { field: 'email' });
 */
class ApiError extends Error {
  /**
   * Creates a new ApiError instance.
   *
   * @param {number} statusCode - HTTP status code
   * @param {string} message - Error message
   * @param {Object} [data] - Additional error data
   */
  constructor(statusCode, message, data = null) {
    super(message);
    this.statusCode = statusCode;
    this.data = data;
    this.isOperational = true; // Distinguishes operational errors from programming errors

    // Capture stack trace (V8 engines only)
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Factory functions for common error types.
 * These provide a clean, consistent way to create errors throughout the app.
 */
const Errors = {
  badRequest: (message, data) => new ApiError(400, message || 'Bad Request', data),
  unauthorized: (message) => new ApiError(401, message || 'Unauthorized'),
  forbidden: (message) => new ApiError(403, message || 'Forbidden'),
  notFound: (message) => new ApiError(404, message || 'Not Found'),
  methodNotAllowed: (message) => new ApiError(405, message || 'Method Not Allowed'),
  tooManyRequests: (message) => new ApiError(429, message || 'Too Many Requests'),
  internal: (message) => new ApiError(500, message || 'Internal Server Error'),
  serviceUnavailable: (message) => new ApiError(503, message || 'Service Unavailable'),
};

/**
 * Middleware to handle 404 errors for undefined routes.
 * This should be placed after all your route definitions.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
function notFoundHandler(req, res, next) {
  next(Errors.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

/**
 * Global error handling middleware.
 * This should be the LAST middleware in your Express app.
 *
 * Features:
 * - Handles both operational and programming errors
 * - Returns appropriate error format based on environment
 * - Logs errors for debugging
 * - Prevents sensitive information leakage in production
 *
 * @param {Error} err - The error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
function globalErrorHandler(err, req, res, next) {
  // Default to 500 Internal Server Error if no status code is set
  const statusCode = err.statusCode || 500;
  const isOperational = err.isOperational || false;

  // ---------------------------------------------------------------------------
  // Error Logging
  // ---------------------------------------------------------------------------

  // Log all errors in development, only non-operational in production
  if (config.server.isDevelopment || !isOperational) {
    console.error('='.repeat(80));
    console.error('ERROR OCCURRED:', new Date().toISOString());
    console.error('-'.repeat(80));
    console.error('Message:', err.message);
    console.error('Status:', statusCode);
    console.error('Operational:', isOperational);
    console.error('URL:', req.originalUrl);
    console.error('Method:', req.method);
    console.error('IP:', req.ip);

    if (err.stack) {
      console.error('-'.repeat(80));
      console.error('Stack trace:');
      console.error(err.stack);
    }

    console.error('='.repeat(80));
  }

  // ---------------------------------------------------------------------------
  // Error Response
  // ---------------------------------------------------------------------------

  // Build the error response object
  const errorResponse = {
    success: false,
    error: {
      message: err.message,
      statusCode: statusCode,
    },
  };

  // Add additional error data if present
  if (err.data) {
    errorResponse.error.details = err.data;
  }

  // In development, include stack trace for debugging
  if (config.server.isDevelopment) {
    errorResponse.error.stack = err.stack;
    errorResponse.error.isOperational = isOperational;
  }

  // In production, hide internal error details for security
  if (config.server.isProduction && !isOperational) {
    // Replace the message for non-operational errors
    // These are likely programming errors that shouldn't be exposed
    errorResponse.error.message = 'An unexpected error occurred. Please try again later.';
    delete errorResponse.error.details;
  }

  // Send the error response
  res.status(statusCode).json(errorResponse);
}

/**
 * Async handler wrapper to catch errors in async route handlers.
 * Eliminates the need for try-catch blocks in every async handler.
 *
 * Usage:
 *   router.get('/route', asyncHandler(async (req, res) => {
 *     const data = await someAsyncOperation();
 *     res.json(data);
 *   }));
 *
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Wrapped function that catches errors
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Request timeout middleware.
 * Prevents requests from hanging indefinitely.
 *
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Function} Express middleware function
 */
function timeoutHandler(timeout = 30000) {
  return (req, res, next) => {
    // Set the timeout
    req.setTimeout(timeout, () => {
      // Check if response has already been sent
      if (!res.headersSent) {
        next(new ApiError(408, 'Request timeout'));
      }
    });
    next();
  };
}

// Export error handling utilities
module.exports = {
  ApiError,
  Errors,
  notFoundHandler,
  globalErrorHandler,
  asyncHandler,
  timeoutHandler,
};
