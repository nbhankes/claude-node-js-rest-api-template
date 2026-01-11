/**
 * =============================================================================
 * HEALTH CHECK & UTILITY ROUTES
 * =============================================================================
 *
 * This module contains utility endpoints for monitoring, debugging, and
 * API documentation. These are essential for production deployments.
 *
 * BEST PRACTICES DEMONSTRATED:
 * - Health check endpoints for load balancers and monitoring
 * - API information endpoints for discoverability
 * - Token usage monitoring for cost control
 * - Circuit breaker status for reliability monitoring
 * - Environment-aware response detail levels
 * - No authentication required for basic health checks
 *
 * =============================================================================
 */

const express = require('express');
const router = express.Router();
const { config, getSafeConfig } = require('../config');
const { validEmotions } = require('../middleware/validation');
const {
  getTokenStats,
  getCircuitBreakerState,
  resetTokenStats,
  resetCircuitBreaker,
} = require('../services/claudeService');

// =============================================================================
// HEALTH CHECK ENDPOINTS
// =============================================================================

/**
 * GET /health
 *
 * Basic health check endpoint.
 * Returns a simple status for load balancers and monitoring services.
 *
 * This endpoint should:
 * - Return quickly (no external dependencies)
 * - Return 200 if the server is running
 * - Be publicly accessible (no auth required)
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/detailed
 *
 * Detailed health check with more diagnostic information.
 * Useful for debugging but should be protected in production.
 *
 * Returns:
 * - Server status
 * - Environment information
 * - Memory usage
 * - Uptime
 * - Circuit breaker status
 */
router.get('/health/detailed', (req, res) => {
  // Get memory usage
  const memoryUsage = process.memoryUsage();

  // Get circuit breaker status
  const circuitBreaker = getCircuitBreakerState();

  // Build the detailed health response
  const healthInfo = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: {
      seconds: Math.floor(process.uptime()),
      formatted: formatUptime(process.uptime()),
    },
    environment: config.server.nodeEnv,
    memory: {
      heapUsed: formatBytes(memoryUsage.heapUsed),
      heapTotal: formatBytes(memoryUsage.heapTotal),
      external: formatBytes(memoryUsage.external),
      rss: formatBytes(memoryUsage.rss),
    },
    node: {
      version: process.version,
      platform: process.platform,
    },
    circuitBreaker: {
      state: circuitBreaker.state,
      failures: circuitBreaker.failures,
      // Include warning if circuit is not closed
      warning: circuitBreaker.state !== 'CLOSED'
        ? 'Circuit breaker is not in normal state. Claude API may be experiencing issues.'
        : null,
    },
  };

  // Only include sensitive info in development
  if (config.server.isDevelopment) {
    healthInfo.config = getSafeConfig();
  }

  res.json(healthInfo);
});

/**
 * GET /health/ready
 *
 * Readiness probe for Kubernetes and container orchestration.
 * Returns 200 only if the service is ready to accept traffic.
 *
 * Checks:
 * - Circuit breaker is not open (API is reachable)
 * - API key is configured
 */
router.get('/health/ready', (req, res) => {
  const circuitBreaker = getCircuitBreakerState();
  const issues = [];

  // Check circuit breaker
  if (circuitBreaker.state === 'OPEN') {
    issues.push('Circuit breaker is OPEN - Claude API may be unavailable');
  }

  // Check API key configuration
  if (!config.anthropic.apiKey) {
    issues.push('Anthropic API key is not configured');
  }

  if (issues.length > 0) {
    return res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      issues: issues,
    });
  }

  res.json({
    status: 'ready',
    timestamp: new Date().toISOString(),
  });
});

// =============================================================================
// MONITORING ENDPOINTS
// =============================================================================

/**
 * GET /api/stats
 *
 * Returns API usage statistics.
 * Useful for monitoring costs and usage patterns.
 *
 * SECURITY: This endpoint should be protected in production
 * as it reveals usage information.
 */
router.get('/api/stats', (req, res) => {
  // In production, you might want to require authentication for this endpoint
  if (config.server.isProduction && config.security.requireApiKey) {
    // The apiKeyAuth middleware should handle this if applied,
    // but we add an extra check here for safety
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required for stats endpoint in production',
      });
    }
  }

  const tokenStats = getTokenStats();
  const circuitBreaker = getCircuitBreakerState();

  res.json({
    success: true,
    stats: {
      tokens: tokenStats,
      circuitBreaker: {
        state: circuitBreaker.state,
        consecutiveFailures: circuitBreaker.failures,
        lastFailure: circuitBreaker.lastFailureTime
          ? new Date(circuitBreaker.lastFailureTime).toISOString()
          : null,
      },
      limits: {
        hardMaxTokens: config.anthropic.hardMaxTokens,
        maxPromptLength: config.anthropic.maxPromptLength,
        rateLimitPerWindow: config.rateLimit.claudeApiMax,
      },
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/stats/reset
 *
 * Resets API statistics (token counters, circuit breaker).
 * Useful for testing or after resolving issues.
 *
 * SECURITY: This endpoint should be protected and only
 * accessible to administrators.
 */
router.post('/api/stats/reset', (req, res) => {
  // Only allow in development or with proper authentication
  if (config.server.isProduction) {
    return res.status(403).json({
      success: false,
      error: 'Stats reset is disabled in production',
    });
  }

  const { resetTokens, resetCircuit } = req.body || {};

  const results = {
    tokensReset: false,
    circuitBreakerReset: false,
  };

  if (resetTokens !== false) {
    resetTokenStats();
    results.tokensReset = true;
  }

  if (resetCircuit !== false) {
    resetCircuitBreaker();
    results.circuitBreakerReset = true;
  }

  res.json({
    success: true,
    message: 'Stats reset successfully',
    results: results,
    timestamp: new Date().toISOString(),
  });
});

// =============================================================================
// API INFORMATION ENDPOINTS
// =============================================================================

/**
 * GET /api/info
 *
 * API information endpoint.
 * Provides documentation about available endpoints and parameters.
 * This is useful for API consumers to understand the available functionality.
 */
router.get('/api/info', (req, res) => {
  res.json({
    name: 'Claude Emotions API',
    version: '1.0.0',
    description: 'A REST API for emotion-based AI interactions powered by Claude',
    baseUrl: `http://localhost:${config.server.port}`,
    features: {
      retryLogic: 'Automatic retry with exponential backoff for transient failures',
      circuitBreaker: 'Prevents cascade failures when Claude API is unavailable',
      tokenTracking: 'Monitors token usage for cost control',
      rateLimiting: 'Protects against abuse and controls costs',
      inputValidation: 'Comprehensive validation of all inputs',
    },
    documentation: {
      endpoints: {
        affirmations: {
          positive: {
            methods: ['GET', 'POST'],
            path: '/api/affirmations/positive',
            description: 'Get a positive, uplifting affirmation',
            parameters: {
              emotion: `Optional. One of: ${validEmotions.join(', ')}`,
              context: 'Optional. Additional context for personalization (max 500 chars)',
              model: 'Optional. Claude model to use',
              maxTokens: `Optional. Maximum response length (1-${config.anthropic.hardMaxTokens})`,
              temperature: 'Optional. Creativity level (0-1)',
            },
          },
          negative: {
            methods: ['GET', 'POST'],
            path: '/api/affirmations/negative',
            description: 'Get a humorous "negative" affirmation (for entertainment)',
            parameters: {
              context: 'Optional. Topic for the humor (max 500 chars)',
              model: 'Optional. Claude model to use',
              maxTokens: `Optional. Maximum response length (1-${config.anthropic.hardMaxTokens})`,
              temperature: 'Optional. Creativity level (0-1)',
            },
          },
        },
        emotions: {
          support: {
            methods: ['GET', 'POST'],
            path: '/api/emotions/support',
            description: 'Get supportive content for a specific emotion',
            parameters: {
              emotion: `Required. One of: ${validEmotions.join(', ')}`,
              context: 'Optional. Additional context (max 500 chars)',
              model: 'Optional. Claude model to use',
              maxTokens: 'Optional. Maximum response length',
              temperature: 'Optional. Creativity level (0-1)',
            },
          },
          motivationalQuote: {
            methods: ['GET'],
            path: '/api/emotions/motivational-quote',
            description: 'Get an inspirational quote',
            parameters: {
              emotion: 'Optional. Current emotion to tailor the quote',
              context: 'Optional. Theme for the quote',
              model: 'Optional. Claude model to use',
              maxTokens: 'Optional. Maximum response length',
              temperature: 'Optional. Creativity level (0-1)',
            },
          },
          wellnessTip: {
            methods: ['GET'],
            path: '/api/emotions/wellness-tip',
            description: 'Get a practical wellness tip',
            parameters: {
              emotion: 'Optional. Current emotion for tailored advice',
              context: 'Optional. Focus area (sleep, stress, energy, etc.)',
              model: 'Optional. Claude model to use',
            },
          },
          analyze: {
            methods: ['POST'],
            path: '/api/emotions/analyze',
            description: 'Analyze text for emotional content',
            body: {
              prompt: 'Required. Text to analyze (max 10000 chars)',
              model: 'Optional. Claude model to use',
              maxTokens: 'Optional. Maximum response length',
              temperature: 'Optional. Creativity level (0-1)',
            },
          },
          custom: {
            methods: ['POST'],
            path: '/api/emotions/custom',
            description: 'Send a custom emotion-related prompt',
            body: {
              prompt: 'Required. Custom prompt text (max 10000 chars)',
              model: 'Optional. Claude model to use',
              maxTokens: 'Optional. Maximum response length',
              temperature: 'Optional. Creativity level (0-1)',
            },
          },
        },
        utility: {
          health: {
            methods: ['GET'],
            path: '/health',
            description: 'Basic health check',
          },
          healthDetailed: {
            methods: ['GET'],
            path: '/health/detailed',
            description: 'Detailed health check with diagnostics',
          },
          healthReady: {
            methods: ['GET'],
            path: '/health/ready',
            description: 'Readiness probe (for Kubernetes)',
          },
          stats: {
            methods: ['GET'],
            path: '/api/stats',
            description: 'API usage statistics and monitoring data',
          },
          models: {
            methods: ['GET'],
            path: '/api/models',
            description: 'List available Claude models',
          },
        },
      },
      validEmotions: validEmotions,
      availableModels: config.anthropic.validModels,
      defaultModel: config.anthropic.defaultModel,
      defaultMaxTokens: config.anthropic.defaultMaxTokens,
      hardMaxTokens: config.anthropic.hardMaxTokens,
      authentication: config.security.requireApiKey
        ? 'Required. Include X-API-Key header with your requests.'
        : 'Not required (development mode)',
    },
  });
});

/**
 * GET /api/models
 *
 * Lists available Claude models that can be used with this API.
 * Helpful for clients to know which models they can specify.
 */
router.get('/api/models', (req, res) => {
  res.json({
    success: true,
    models: config.anthropic.validModels.map((model) => ({
      id: model,
      isDefault: model === config.anthropic.defaultModel,
    })),
    default: config.anthropic.defaultModel,
    limits: {
      maxTokens: config.anthropic.hardMaxTokens,
      maxPromptLength: config.anthropic.maxPromptLength,
    },
  });
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Formats bytes into a human-readable string.
 *
 * @param {number} bytes - Number of bytes
 * @returns {string} Formatted string (e.g., "1.5 MB")
 */
function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let unitIndex = 0;
  let size = bytes;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Formats uptime seconds into a human-readable string.
 *
 * @param {number} seconds - Uptime in seconds
 * @returns {string} Formatted string (e.g., "2d 5h 30m 15s")
 */
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);

  return parts.join(' ');
}

// Export the router
module.exports = router;
