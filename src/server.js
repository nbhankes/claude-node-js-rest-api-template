/**
 * =============================================================================
 * EXPRESS SERVER - MAIN ENTRY POINT
 * =============================================================================
 *
 * This is the main entry point for the Claude AI Emotions API.
 * It sets up the Express server with all necessary middleware, routes, and
 * error handling.
 *
 * ARCHITECTURE OVERVIEW:
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                           Express Server                                │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │  Middleware Stack (executed in order):                                  │
 * │  1. Request ID (tracking)                                               │
 * │  2. Helmet (security headers)                                           │
 * │  3. Additional Security Headers                                         │
 * │  4. CORS (cross-origin requests)                                        │
 * │  5. General Rate Limiter (prevent abuse)                                │
 * │  6. Morgan (request logging)                                            │
 * │  7. JSON Parser (parse request bodies)                                  │
 * │  8. Input Sanitization (prevent injection)                              │
 * │  9. Timeout Handler (prevent hanging requests)                          │
 * │  10. API Key Authentication (on protected routes)                       │
 * │  11. Claude API Rate Limiter (cost control)                             │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │  Routes:                                                                │
 * │  - /health, /health/detailed, /health/ready - Health checks             │
 * │  - /api/info, /api/models, /api/stats - API information & monitoring    │
 * │  - /api/affirmations/* - Positive/negative affirmations                 │
 * │  - /api/emotions/* - Emotion support, quotes, analysis                  │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │  Error Handling:                                                        │
 * │  - 404 handler for undefined routes                                     │
 * │  - Global error handler for all errors                                  │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * BEST PRACTICES DEMONSTRATED:
 * - Security-first middleware configuration
 * - Proper middleware ordering (security → parsing → routes → errors)
 * - Multiple rate limiters (general + API-specific for cost control)
 * - Request ID tracking for debugging
 * - Graceful shutdown handling
 * - Environment-based configuration
 * - Centralized error handling
 *
 * =============================================================================
 */

// =============================================================================
// DEPENDENCIES
// =============================================================================

const express = require('express');
const helmet = require('helmet');       // Security headers
const cors = require('cors');           // Cross-origin resource sharing
const morgan = require('morgan');       // HTTP request logging
const rateLimit = require('express-rate-limit'); // Rate limiting

// Internal modules
const { config, validateConfig } = require('./config');
const { notFoundHandler, globalErrorHandler, timeoutHandler } = require('./middleware/errorHandler');
const {
  apiKeyAuth,
  requestId,
  sanitizeInput,
  additionalSecurityHeaders,
} = require('./middleware/security');

// Route modules
const healthRoutes = require('./routes/health');
const affirmationsRoutes = require('./routes/affirmations');
const emotionsRoutes = require('./routes/emotions');

// =============================================================================
// CONFIGURATION VALIDATION
// =============================================================================

/**
 * Validate configuration before starting the server.
 * This catches configuration errors early, preventing cryptic runtime failures.
 *
 * DEFENSIVE PROGRAMMING: Fail fast and fail clearly
 */
try {
  validateConfig();
  console.log('✓ Configuration validated successfully');
} catch (error) {
  console.error('✗ Configuration validation failed:');
  console.error(error.message);
  console.error('\nPlease check your .env file and ensure all required variables are set.');
  console.error('See .env.example for reference.');
  process.exit(1); // Exit with error code
}

// =============================================================================
// EXPRESS APP INITIALIZATION
// =============================================================================

const app = express();

// =============================================================================
// TRUST PROXY SETTING (must be set early)
// =============================================================================

/**
 * Trust proxy setting for when running behind a reverse proxy.
 *
 * This is necessary for:
 * - Correct client IP detection for rate limiting
 * - Proper protocol detection (HTTP vs HTTPS)
 *
 * SECURITY: Set this correctly to ensure proper IP detection
 * Set to 1 if behind one proxy (like nginx or a load balancer).
 * Set to true to trust all proxies (not recommended for security).
 */
if (config.server.isProduction) {
  app.set('trust proxy', config.security.trustProxy);
}

// =============================================================================
// REQUEST TRACKING MIDDLEWARE
// =============================================================================

/**
 * Add unique request ID to every request.
 * This must be early in the middleware chain so all subsequent
 * middleware and routes can access the request ID for logging.
 */
app.use(requestId);

// =============================================================================
// SECURITY MIDDLEWARE
// =============================================================================

/**
 * Helmet sets various HTTP headers to secure the app.
 *
 * Headers set by default:
 * - Content-Security-Policy: Prevents XSS attacks
 * - X-DNS-Prefetch-Control: Controls browser DNS prefetching
 * - X-Frame-Options: Prevents clickjacking
 * - X-Content-Type-Options: Prevents MIME type sniffing
 * - And more...
 *
 * SECURITY: Always use Helmet in production
 */
app.use(helmet());

/**
 * Additional security headers beyond what Helmet provides.
 * Includes cache control, additional XSS protection, etc.
 */
app.use(additionalSecurityHeaders);

/**
 * CORS (Cross-Origin Resource Sharing) configuration.
 *
 * Controls which domains can access your API.
 * In production, restrict this to your specific frontend domain.
 *
 * SECURITY: Never use '*' in production for sensitive APIs
 */
app.use(cors({
  origin: config.cors.origin,
  methods: ['GET', 'POST', 'OPTIONS'],  // Allowed HTTP methods
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID'], // Allowed headers
  credentials: true,  // Allow cookies to be sent
  maxAge: 86400,      // Cache preflight requests for 24 hours
}));

/**
 * General rate limiting to prevent abuse and DoS attacks.
 *
 * Limits each IP to a certain number of requests per time window.
 * This is a general limit; Claude API endpoints have an additional stricter limit.
 *
 * SECURITY: Essential for any public API
 */
const generalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,  // Time window
  max: config.rateLimit.max,            // Max requests per window
  message: {
    success: false,
    error: 'Too many requests, please try again later.',
    retryAfter: Math.ceil(config.rateLimit.windowMs / 1000), // Seconds
  },
  standardHeaders: true,  // Return rate limit info in headers
  legacyHeaders: false,   // Disable X-RateLimit-* headers
  // Use request ID in rate limit key for better tracking
  keyGenerator: (req) => req.ip,
});

// Apply general rate limiting to all requests
app.use(generalLimiter);

/**
 * Stricter rate limiter specifically for Claude API endpoints.
 *
 * COST PROTECTION: The Claude API costs money per token.
 * This stricter limit helps prevent:
 * - Accidental cost overruns from bugs or loops
 * - Intentional abuse from bad actors
 * - Runaway costs from misconfigured clients
 */
const claudeApiLimiter = rateLimit({
  windowMs: config.rateLimit.claudeApiWindowMs,
  max: config.rateLimit.claudeApiMax,
  message: {
    success: false,
    error: 'Claude API rate limit exceeded. This limit helps control costs.',
    retryAfter: Math.ceil(config.rateLimit.claudeApiWindowMs / 1000),
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
});

// =============================================================================
// REQUEST PARSING MIDDLEWARE
// =============================================================================

/**
 * Parse JSON request bodies.
 *
 * The 'limit' option prevents large payload attacks.
 * The 'strict' option only accepts arrays and objects.
 *
 * SECURITY: Always set a reasonable limit on body size
 */
app.use(express.json({
  limit: config.server.maxBodySize,  // Max body size (prevents large payload attacks)
  strict: true,   // Only accept arrays and objects
}));

/**
 * Parse URL-encoded bodies (form submissions).
 *
 * 'extended: true' allows nested objects in query strings.
 */
app.use(express.urlencoded({
  extended: true,
  limit: config.server.maxBodySize,
}));

/**
 * Sanitize all input to prevent injection attacks.
 *
 * SECURITY: Removes null bytes, trims whitespace, and
 * prevents prototype pollution attacks.
 */
app.use(sanitizeInput);

// =============================================================================
// LOGGING MIDDLEWARE
// =============================================================================

/**
 * Morgan HTTP request logger with custom format including request ID.
 *
 * Available formats:
 * - 'combined': Apache combined log format (production)
 * - 'common': Apache common log format
 * - 'dev': Colored output for development
 * - 'short': Shorter than default
 * - 'tiny': Minimal output
 *
 * BEST PRACTICE: Use 'combined' in production for full request details
 */
if (config.server.nodeEnv !== 'test') {
  // Custom token for request ID
  morgan.token('request-id', (req) => req.id || '-');

  // Custom format that includes request ID
  const logFormat = config.server.isDevelopment
    ? ':method :url :status :response-time ms - :request-id'
    : 'combined';

  app.use(morgan(logFormat));
}

// =============================================================================
// TIMEOUT MIDDLEWARE
// =============================================================================

/**
 * Request timeout handler.
 *
 * Prevents requests from hanging indefinitely.
 * Claude API calls can take a while, so we set a generous timeout.
 *
 * DEFENSIVE PROGRAMMING: Always have timeouts on external service calls
 */
app.use(timeoutHandler(config.server.requestTimeoutMs));

// =============================================================================
// ROUTES - PUBLIC (no authentication required)
// =============================================================================

/**
 * Health check routes (mounted at root for easy access by load balancers).
 *
 * These endpoints are NOT protected by API key authentication because:
 * - Load balancers need to check health without credentials
 * - Kubernetes probes need unrestricted access
 * - Basic health checks don't expose sensitive data
 */
app.use('/', healthRoutes);

/**
 * GET /
 *
 * Root route provides basic API information and links to documentation.
 * Useful for API discoverability.
 */
app.get('/', (req, res) => {
  res.json({
    name: 'Claude AI Emotions API',
    version: '1.0.0',
    description: 'A REST API for emotion-based AI interactions powered by Claude',
    requestId: req.id,
    links: {
      health: '/health',
      ready: '/health/ready',
      documentation: '/api/info',
      models: '/api/models',
      stats: '/api/stats',
    },
    endpoints: {
      affirmations: '/api/affirmations',
      emotions: '/api/emotions',
    },
    security: {
      authentication: config.security.requireApiKey
        ? 'API key required (X-API-Key header)'
        : 'Not required (development mode)',
    },
  });
});

// =============================================================================
// ROUTES - PROTECTED (API key authentication + stricter rate limiting)
// =============================================================================

/**
 * Apply API key authentication to all Claude API endpoints.
 *
 * SECURITY: When REQUIRE_API_KEY=true, all requests to these endpoints
 * must include a valid API key in the X-API-Key header.
 *
 * This protects against:
 * - Unauthorized access to your API
 * - Cost abuse from unknown clients
 * - Scraping and automated abuse
 */
const protectedRoutes = express.Router();

// Apply API key authentication (checks REQUIRE_API_KEY config)
protectedRoutes.use(apiKeyAuth);

// Apply stricter rate limiting for Claude API calls (cost protection)
protectedRoutes.use(claudeApiLimiter);

// Mount the protected routes
protectedRoutes.use('/affirmations', affirmationsRoutes);
protectedRoutes.use('/emotions', emotionsRoutes);

// Apply protected routes under /api prefix
app.use('/api', protectedRoutes);

// =============================================================================
// ERROR HANDLING
// =============================================================================

/**
 * 404 Handler - catches requests to undefined routes.
 *
 * IMPORTANT: This must come AFTER all route definitions.
 */
app.use(notFoundHandler);

/**
 * Global Error Handler - catches all errors.
 *
 * IMPORTANT: This must be the LAST middleware.
 * Express identifies error handlers by their 4-parameter signature.
 */
app.use(globalErrorHandler);

// =============================================================================
// SERVER STARTUP
// =============================================================================

/**
 * Start the Express server.
 *
 * We store the server instance for graceful shutdown handling.
 */
const server = app.listen(config.server.port, () => {
  console.log('='.repeat(70));
  console.log('  Claude AI Emotions API');
  console.log('='.repeat(70));
  console.log(`  Environment:     ${config.server.nodeEnv}`);
  console.log(`  Server:          http://localhost:${config.server.port}`);
  console.log(`  API Info:        http://localhost:${config.server.port}/api/info`);
  console.log(`  Health Check:    http://localhost:${config.server.port}/health`);
  console.log(`  Readiness:       http://localhost:${config.server.port}/health/ready`);
  console.log(`  Stats:           http://localhost:${config.server.port}/api/stats`);
  console.log('-'.repeat(70));
  console.log('  Security:');
  console.log(`    API Key Auth:  ${config.security.requireApiKey ? 'ENABLED' : 'DISABLED'}`);
  console.log(`    Rate Limit:    ${config.rateLimit.max} requests per ${config.rateLimit.windowMs / 60000} min`);
  console.log(`    Claude Limit:  ${config.rateLimit.claudeApiMax} requests per ${config.rateLimit.claudeApiWindowMs / 60000} min`);
  console.log('-'.repeat(70));
  console.log('  Cost Protection:');
  console.log(`    Hard Max Tokens: ${config.anthropic.hardMaxTokens}`);
  console.log(`    Max Prompt Len:  ${config.anthropic.maxPromptLength} chars`);
  console.log('-'.repeat(70));
  console.log('  Available Endpoints:');
  console.log('    GET/POST  /api/affirmations/positive');
  console.log('    GET/POST  /api/affirmations/negative');
  console.log('    GET/POST  /api/emotions/support');
  console.log('    GET       /api/emotions/motivational-quote');
  console.log('    GET       /api/emotions/wellness-tip');
  console.log('    POST      /api/emotions/analyze');
  console.log('    POST      /api/emotions/custom');
  console.log('='.repeat(70));
});

// =============================================================================
// GRACEFUL SHUTDOWN
// =============================================================================

/**
 * Graceful shutdown handler.
 *
 * Handles SIGTERM (kill command) and SIGINT (Ctrl+C) signals.
 * Allows existing requests to complete before shutting down.
 *
 * BEST PRACTICE: Always implement graceful shutdown for production apps
 */
function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);

  // Stop accepting new connections
  server.close(() => {
    console.log('Server closed. All pending requests completed.');
    process.exit(0);
  });

  // Force shutdown after 30 seconds if connections don't close
  setTimeout(() => {
    console.error('Could not close connections in time. Forcefully shutting down.');
    process.exit(1);
  }, 30000);
}

// Listen for shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// =============================================================================
// UNHANDLED ERRORS
// =============================================================================

/**
 * Handle unhandled promise rejections.
 *
 * In Node.js, unhandled promise rejections can crash the server.
 * We log them and optionally exit to prevent undefined behavior.
 */
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  // In production, you might want to exit and let a process manager restart
  if (config.server.isProduction) {
    process.exit(1);
  }
});

/**
 * Handle uncaught exceptions.
 *
 * Uncaught exceptions leave the app in an undefined state.
 * We log and exit, letting a process manager (PM2, systemd) restart us.
 */
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Exit is recommended as the app is in an undefined state
  process.exit(1);
});

// =============================================================================
// EXPORT FOR TESTING
// =============================================================================

/**
 * Export the app for testing purposes.
 * This allows test frameworks to make requests without starting the server.
 */
module.exports = app;
