/**
 * =============================================================================
 * SECURITY MIDDLEWARE
 * =============================================================================
 *
 * This module provides security-related middleware for the Express application.
 * It includes API key authentication, request sanitization, and security headers.
 *
 * BEST PRACTICES DEMONSTRATED:
 * - API key authentication for protected endpoints
 * - Timing-safe comparison to prevent timing attacks
 * - Request ID generation for tracing
 * - Input sanitization
 * - Security headers configuration
 *
 * =============================================================================
 */

const crypto = require('crypto');
const { config } = require('../config');
const { Errors } = require('./errorHandler');

// =============================================================================
// API KEY AUTHENTICATION
// =============================================================================

/**
 * Middleware to authenticate requests using API key.
 *
 * When enabled (REQUIRE_API_KEY=true), this middleware checks for a valid
 * API key in the X-API-Key header. Requests without a valid key are rejected.
 *
 * SECURITY FEATURES:
 * - Timing-safe comparison prevents timing attacks
 * - Generic error messages prevent information leakage
 * - Supports multiple authentication header formats
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
function apiKeyAuth(req, res, next) {
  // Skip authentication if not required
  if (!config.security.requireApiKey) {
    return next();
  }

  // Skip authentication if no API key is configured (misconfiguration warning)
  if (!config.security.apiKey) {
    console.warn(
      'WARNING: REQUIRE_API_KEY is true but API_KEY is not set. ' +
      'All requests will be rejected.'
    );
    throw Errors.internal('Server authentication misconfigured');
  }

  // Get API key from request headers
  // Support multiple header formats for flexibility
  const providedKey =
    req.headers['x-api-key'] ||           // Standard custom header
    req.headers['authorization']?.replace(/^Bearer\s+/i, '') || // Bearer token
    req.query.api_key;                    // Query parameter (less secure, but sometimes needed)

  // Check if API key was provided
  if (!providedKey) {
    throw Errors.unauthorized(
      'API key required. Include X-API-Key header with your request.'
    );
  }

  // Use timing-safe comparison to prevent timing attacks
  // Timing attacks can reveal information about the secret key by measuring
  // how long the comparison takes
  const isValid = timingSafeEqual(providedKey, config.security.apiKey);

  if (!isValid) {
    // Log failed authentication attempt (useful for security monitoring)
    console.warn(`Invalid API key attempt from IP: ${req.ip}`);

    // Use generic message to prevent information leakage
    throw Errors.unauthorized('Invalid API key');
  }

  // Authentication successful
  next();
}

/**
 * Performs a timing-safe string comparison.
 *
 * Regular string comparison (===) can leak information about the secret
 * through timing differences. This function takes the same amount of time
 * regardless of where the strings differ.
 *
 * @param {string} a - First string to compare
 * @param {string} b - Second string to compare
 * @returns {boolean} True if strings are equal
 */
function timingSafeEqual(a, b) {
  // Handle null/undefined inputs
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  // Convert strings to buffers for crypto.timingSafeEqual
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  // If lengths differ, we still need to compare to maintain constant time
  // We compare bufA with itself to maintain timing consistency
  if (bufA.length !== bufB.length) {
    // Compare bufA with itself to take same time, then return false
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }

  // Perform timing-safe comparison
  return crypto.timingSafeEqual(bufA, bufB);
}

// =============================================================================
// REQUEST ID MIDDLEWARE
// =============================================================================

/**
 * Middleware to add a unique request ID to each request.
 *
 * Request IDs are essential for:
 * - Tracing requests through logs
 * - Correlating errors with specific requests
 * - Debugging distributed systems
 *
 * The request ID is:
 * - Added to req.id for use in route handlers
 * - Added to response headers for client correlation
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
function requestId(req, res, next) {
  // Check for existing request ID (useful when behind a proxy that adds one)
  const existingId = req.headers['x-request-id'] || req.headers['x-correlation-id'];

  // Generate a new ID if none exists
  // Format: req_[timestamp]_[random]
  const id = existingId || `req_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

  // Attach to request object for use in handlers
  req.id = id;

  // Add to response headers so clients can correlate requests
  res.setHeader('X-Request-ID', id);

  next();
}

// =============================================================================
// INPUT SANITIZATION
// =============================================================================

/**
 * Middleware to sanitize request inputs.
 *
 * Performs basic sanitization on request body, query, and params to
 * prevent common injection attacks.
 *
 * NOTE: This is a basic sanitizer. For production, consider using
 * specialized libraries like DOMPurify for HTML or validator.js for
 * comprehensive validation.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
function sanitizeInput(req, res, next) {
  // Sanitize query parameters
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }

  // Sanitize body (if JSON)
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }

  // Sanitize URL parameters
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }

  next();
}

/**
 * Recursively sanitizes an object's string values.
 *
 * @param {Object} obj - Object to sanitize
 * @returns {Object} Sanitized object
 */
function sanitizeObject(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  if (typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      // Also sanitize keys to prevent prototype pollution
      const sanitizedKey = sanitizeString(key);
      // Prevent prototype pollution attacks
      if (sanitizedKey === '__proto__' || sanitizedKey === 'constructor' || sanitizedKey === 'prototype') {
        continue; // Skip dangerous keys
      }
      sanitized[sanitizedKey] = sanitizeObject(value);
    }
    return sanitized;
  }

  return obj;
}

/**
 * Sanitizes a string value.
 *
 * @param {string} str - String to sanitize
 * @returns {string} Sanitized string
 */
function sanitizeString(str) {
  if (typeof str !== 'string') {
    return str;
  }

  return str
    // Remove null bytes (can cause issues in some systems)
    .replace(/\0/g, '')
    // Trim excessive whitespace
    .trim();

  // NOTE: We intentionally don't HTML-encode here because:
  // 1. This is a JSON API, not serving HTML
  // 2. Claude's responses shouldn't be rendered as HTML without escaping
  // 3. Over-sanitization can corrupt legitimate data
}

// =============================================================================
// SECURITY HEADERS
// =============================================================================

/**
 * Additional security headers beyond what Helmet provides.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
function additionalSecurityHeaders(req, res, next) {
  // Prevent caching of API responses (sensitive data)
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking (though less relevant for APIs)
  res.setHeader('X-Frame-Options', 'DENY');

  // XSS protection for older browsers
  res.setHeader('X-XSS-Protection', '1; mode=block');

  next();
}

// =============================================================================
// IP EXTRACTION
// =============================================================================

/**
 * Gets the client's real IP address, accounting for proxies.
 *
 * @param {Object} req - Express request object
 * @returns {string} Client IP address
 */
function getClientIp(req) {
  // Check X-Forwarded-For header (set by proxies)
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    // X-Forwarded-For can contain multiple IPs; the first is the client
    const ips = forwardedFor.split(',').map(ip => ip.trim());
    return ips[0];
  }

  // Check X-Real-IP header (set by some proxies like nginx)
  if (req.headers['x-real-ip']) {
    return req.headers['x-real-ip'];
  }

  // Fall back to direct connection IP
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  apiKeyAuth,
  requestId,
  sanitizeInput,
  additionalSecurityHeaders,
  getClientIp,
  timingSafeEqual, // Exported for testing
};
