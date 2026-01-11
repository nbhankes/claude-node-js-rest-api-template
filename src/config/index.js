/**
 * =============================================================================
 * CONFIGURATION MODULE
 * =============================================================================
 *
 * This module centralizes all environment configuration for the application.
 * It provides a single source of truth for configuration values and includes
 * validation to ensure required values are present.
 *
 * BEST PRACTICES DEMONSTRATED:
 * - Centralized configuration management
 * - Environment variable validation
 * - Sensible defaults for optional values
 * - Type coercion for numeric values
 * - Clear separation of configuration concerns
 * - Security-focused limits and constraints
 * - Cost protection through token limits
 *
 * =============================================================================
 */

// Load environment variables from .env file
// This MUST be called before accessing process.env values
require('dotenv').config();

/**
 * Configuration object containing all application settings.
 * Values are loaded from environment variables with fallbacks to defaults.
 */
const config = {
  // ---------------------------------------------------------------------------
  // Anthropic API Configuration
  // ---------------------------------------------------------------------------
  anthropic: {
    // API key is REQUIRED - the app cannot function without it
    apiKey: process.env.ANTHROPIC_API_KEY,

    // Default model for Claude API requests
    // Users can override this per-request via query params or request body
    defaultModel: process.env.DEFAULT_MODEL || 'claude-sonnet-4-20250514',

    // Default maximum tokens for responses
    // Controls the maximum length of Claude's responses
    // Users can override this per-request (up to hardMaxTokens)
    defaultMaxTokens: parseInt(process.env.DEFAULT_MAX_TOKENS, 10) || 1024,

    // COST PROTECTION: Hard maximum tokens limit
    // This is the absolute maximum that cannot be exceeded by user requests
    // Prevents accidental or malicious requests for extremely long responses
    // Set lower for cost-sensitive deployments
    hardMaxTokens: parseInt(process.env.HARD_MAX_TOKENS, 10) || 4096,

    // SECURITY: Maximum prompt length in characters
    // Prevents extremely long prompts that could abuse token limits
    // ~4 characters ≈ 1 token, so 50000 chars ≈ 12500 tokens max input
    maxPromptLength: parseInt(process.env.MAX_PROMPT_LENGTH, 10) || 50000,

    // SECURITY: Maximum system prompt length in characters
    // System prompts should be controlled by the application, but
    // if user input can influence them, this provides a safety limit
    maxSystemPromptLength: parseInt(process.env.MAX_SYSTEM_PROMPT_LENGTH, 10) || 10000,

    // List of valid Claude models that users can select
    // This acts as a whitelist for security - only these models are allowed
    // SECURITY: Restricting models prevents unauthorized access to expensive models
    validModels: [
      'claude-opus-4-5-20251101',
      'claude-sonnet-4-20250514',
      'claude-3-5-haiku-20241022',
      'claude-3-5-sonnet-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
    ],

    // Retry configuration for API calls
    // These can be overridden for different reliability requirements
    retry: {
      maxRetries: parseInt(process.env.API_MAX_RETRIES, 10) || 3,
      baseDelayMs: parseInt(process.env.API_RETRY_BASE_DELAY_MS, 10) || 1000,
      maxDelayMs: parseInt(process.env.API_RETRY_MAX_DELAY_MS, 10) || 10000,
    },

    // Circuit breaker configuration
    circuitBreaker: {
      failureThreshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD, 10) || 5,
      resetTimeoutMs: parseInt(process.env.CIRCUIT_BREAKER_RESET_MS, 10) || 30000,
    },
  },

  // ---------------------------------------------------------------------------
  // Server Configuration
  // ---------------------------------------------------------------------------
  server: {
    // Port for the Express server to listen on
    port: parseInt(process.env.PORT, 10) || 3000,

    // Node environment - affects logging, error details, etc.
    nodeEnv: process.env.NODE_ENV || 'development',

    // Convenience flags for environment checks
    isDevelopment: (process.env.NODE_ENV || 'development') === 'development',
    isProduction: process.env.NODE_ENV === 'production',
    isTest: process.env.NODE_ENV === 'test',

    // Request timeout in milliseconds
    // Prevents requests from hanging indefinitely
    requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS, 10) || 60000,

    // Maximum request body size
    // SECURITY: Prevents large payload attacks
    maxBodySize: process.env.MAX_BODY_SIZE || '10kb',
  },

  // ---------------------------------------------------------------------------
  // Rate Limiting Configuration
  // ---------------------------------------------------------------------------
  rateLimit: {
    // Maximum requests per window per IP address
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,

    // Time window in milliseconds (converted from minutes)
    windowMs: (parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES, 10) || 15) * 60 * 1000,

    // Separate, stricter rate limit for Claude API endpoints
    // This helps control costs and prevent abuse
    claudeApiMax: parseInt(process.env.CLAUDE_API_RATE_LIMIT_MAX, 10) || 30,
    claudeApiWindowMs: (parseInt(process.env.CLAUDE_API_RATE_LIMIT_WINDOW_MINUTES, 10) || 15) * 60 * 1000,
  },

  // ---------------------------------------------------------------------------
  // CORS Configuration
  // ---------------------------------------------------------------------------
  cors: {
    // Allowed origins for cross-origin requests
    // In production, this should be a specific domain, not '*'
    // SECURITY: Always specify exact origins in production
    origin: process.env.CORS_ORIGIN || '*',
  },

  // ---------------------------------------------------------------------------
  // Logging Configuration
  // ---------------------------------------------------------------------------
  logging: {
    // Morgan logging format
    format: process.env.LOG_FORMAT || 'dev',
  },

  // ---------------------------------------------------------------------------
  // Security Configuration
  // ---------------------------------------------------------------------------
  security: {
    // Optional API key for protecting your endpoints
    // If set, requests must include this key in the X-API-Key header
    apiKey: process.env.API_KEY || null,

    // Whether to require API key authentication
    requireApiKey: process.env.REQUIRE_API_KEY === 'true',

    // Trusted proxy count (for when behind reverse proxy/load balancer)
    // SECURITY: Set this correctly to ensure proper IP detection for rate limiting
    trustProxy: parseInt(process.env.TRUST_PROXY, 10) || 1,
  },
};

/**
 * Validates that all required configuration values are present.
 * Throws an error if any required values are missing.
 *
 * DEFENSIVE PROGRAMMING: We validate configuration at startup rather than
 * letting the application fail later with cryptic errors.
 *
 * @throws {Error} If required configuration is missing
 */
function validateConfig() {
  const errors = [];
  const warnings = [];

  // ---------------------------------------------------------------------------
  // Required Configuration
  // ---------------------------------------------------------------------------

  // Check for required Anthropic API key
  if (!config.anthropic.apiKey) {
    errors.push('ANTHROPIC_API_KEY is required but not set in environment variables');
  }

  // ---------------------------------------------------------------------------
  // Numeric Validation
  // ---------------------------------------------------------------------------

  if (isNaN(config.server.port)) {
    errors.push('PORT must be a valid number');
  }

  if (isNaN(config.anthropic.defaultMaxTokens)) {
    errors.push('DEFAULT_MAX_TOKENS must be a valid number');
  }

  if (isNaN(config.anthropic.hardMaxTokens)) {
    errors.push('HARD_MAX_TOKENS must be a valid number');
  }

  if (isNaN(config.rateLimit.max)) {
    errors.push('RATE_LIMIT_MAX must be a valid number');
  }

  // ---------------------------------------------------------------------------
  // Range Validation
  // ---------------------------------------------------------------------------

  // Validate max tokens is within Claude's limits
  if (config.anthropic.defaultMaxTokens < 1 || config.anthropic.defaultMaxTokens > 8192) {
    errors.push('DEFAULT_MAX_TOKENS must be between 1 and 8192');
  }

  if (config.anthropic.hardMaxTokens < 1 || config.anthropic.hardMaxTokens > 8192) {
    errors.push('HARD_MAX_TOKENS must be between 1 and 8192');
  }

  // Ensure hard max is >= default max
  if (config.anthropic.hardMaxTokens < config.anthropic.defaultMaxTokens) {
    warnings.push('HARD_MAX_TOKENS is less than DEFAULT_MAX_TOKENS; using HARD_MAX_TOKENS as default');
    config.anthropic.defaultMaxTokens = config.anthropic.hardMaxTokens;
  }

  if (config.anthropic.maxPromptLength < 100) {
    errors.push('MAX_PROMPT_LENGTH must be at least 100 characters');
  }

  // ---------------------------------------------------------------------------
  // Security Warnings for Production
  // ---------------------------------------------------------------------------

  if (config.server.isProduction) {
    if (config.cors.origin === '*') {
      warnings.push('CORS_ORIGIN is set to "*" in production - consider restricting to specific domains');
    }

    if (!config.security.requireApiKey) {
      warnings.push('API_KEY authentication is disabled in production - consider enabling REQUIRE_API_KEY=true');
    }
  }

  // ---------------------------------------------------------------------------
  // Output Results
  // ---------------------------------------------------------------------------

  // Log warnings
  if (warnings.length > 0) {
    console.warn('Configuration warnings:');
    warnings.forEach((w) => console.warn(`  ⚠ ${w}`));
  }

  // If there are any errors, throw them all together
  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

/**
 * Checks if a given model name is valid/allowed.
 * This prevents users from attempting to use invalid or unauthorized models.
 *
 * @param {string} model - The model name to validate
 * @returns {boolean} True if the model is valid
 */
function isValidModel(model) {
  return config.anthropic.validModels.includes(model);
}

/**
 * Gets a sanitized config object safe for logging/exposing.
 * Removes sensitive values like API keys.
 *
 * @returns {Object} Configuration without sensitive values
 */
function getSafeConfig() {
  return {
    anthropic: {
      defaultModel: config.anthropic.defaultModel,
      defaultMaxTokens: config.anthropic.defaultMaxTokens,
      hardMaxTokens: config.anthropic.hardMaxTokens,
      maxPromptLength: config.anthropic.maxPromptLength,
      validModels: config.anthropic.validModels,
      apiKeyConfigured: !!config.anthropic.apiKey,
    },
    server: {
      port: config.server.port,
      nodeEnv: config.server.nodeEnv,
      requestTimeoutMs: config.server.requestTimeoutMs,
    },
    rateLimit: {
      max: config.rateLimit.max,
      windowMs: config.rateLimit.windowMs,
      claudeApiMax: config.rateLimit.claudeApiMax,
    },
    security: {
      requireApiKey: config.security.requireApiKey,
      apiKeyConfigured: !!config.security.apiKey,
    },
  };
}

// Export configuration and helper functions
module.exports = {
  config,
  validateConfig,
  isValidModel,
  getSafeConfig,
};
