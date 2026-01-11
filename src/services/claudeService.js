/**
 * =============================================================================
 * CLAUDE API SERVICE
 * =============================================================================
 *
 * This module encapsulates all interactions with the Anthropic Claude API.
 * It provides a clean abstraction layer between your routes and the API,
 * making it easy to modify API behavior in one place.
 *
 * BEST PRACTICES DEMONSTRATED:
 * - Service layer pattern for external API calls
 * - Retry logic with exponential backoff for transient failures
 * - Circuit breaker pattern to prevent cascade failures
 * - Token usage tracking and limits for cost control
 * - Centralized error handling for API interactions
 * - Configuration-driven defaults
 * - Input validation before API calls
 * - Detailed error messages for debugging
 *
 * =============================================================================
 */

const Anthropic = require('@anthropic-ai/sdk');
const { config, isValidModel } = require('../config');

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Retry configuration for transient failures.
 * These values control the exponential backoff behavior.
 */
const RETRY_CONFIG = {
  maxRetries: 3,              // Maximum number of retry attempts
  baseDelayMs: 1000,          // Initial delay between retries (1 second)
  maxDelayMs: 10000,          // Maximum delay between retries (10 seconds)
  backoffMultiplier: 2,       // Multiply delay by this factor each retry
  jitterFactor: 0.1,          // Add random jitter to prevent thundering herd
};

/**
 * HTTP status codes that are safe to retry.
 * Only retry on transient/temporary errors, not on client errors.
 */
const RETRYABLE_STATUS_CODES = [
  408,  // Request Timeout
  429,  // Too Many Requests (rate limited)
  500,  // Internal Server Error
  502,  // Bad Gateway
  503,  // Service Unavailable
  504,  // Gateway Timeout
];

/**
 * Error codes that indicate network issues (safe to retry).
 */
const RETRYABLE_ERROR_CODES = [
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'EHOSTUNREACH',
];

// =============================================================================
// CIRCUIT BREAKER
// =============================================================================

/**
 * Simple circuit breaker implementation to prevent cascade failures.
 *
 * PATTERN EXPLANATION:
 * When an external service fails repeatedly, continuing to send requests
 * wastes resources and can make recovery harder. The circuit breaker
 * "opens" after too many failures, rejecting requests immediately.
 * After a timeout, it allows a test request through ("half-open").
 * If that succeeds, the circuit "closes" and normal operation resumes.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Failing fast, requests rejected immediately
 * - HALF_OPEN: Testing if service recovered
 */
const circuitBreaker = {
  state: 'CLOSED',           // Current circuit state
  failures: 0,               // Consecutive failure count
  lastFailureTime: null,     // Timestamp of last failure
  threshold: 5,              // Failures before opening circuit
  resetTimeoutMs: 30000,     // Time before trying again (30 seconds)

  /**
   * Records a successful API call.
   * Resets failure count and closes the circuit.
   */
  recordSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  },

  /**
   * Records a failed API call.
   * May open the circuit if threshold is exceeded.
   */
  recordFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
      console.warn(`[Circuit Breaker] Circuit OPENED after ${this.failures} failures`);
    }
  },

  /**
   * Checks if a request should be allowed through.
   *
   * @returns {boolean} True if request should proceed
   * @throws {Error} If circuit is open and reset timeout hasn't passed
   */
  canRequest() {
    if (this.state === 'CLOSED') {
      return true;
    }

    if (this.state === 'OPEN') {
      // Check if enough time has passed to try again
      const timeSinceFailure = Date.now() - this.lastFailureTime;

      if (timeSinceFailure >= this.resetTimeoutMs) {
        // Allow one test request through
        this.state = 'HALF_OPEN';
        console.info('[Circuit Breaker] Circuit HALF_OPEN, allowing test request');
        return true;
      }

      // Circuit is still open, reject immediately
      throw new Error(
        'Claude API circuit breaker is open due to repeated failures. ' +
        `Please try again in ${Math.ceil((this.resetTimeoutMs - timeSinceFailure) / 1000)} seconds.`
      );
    }

    // HALF_OPEN state - allow the test request
    return true;
  },

  /**
   * Resets the circuit breaker to initial state.
   * Useful for testing or manual intervention.
   */
  reset() {
    this.state = 'CLOSED';
    this.failures = 0;
    this.lastFailureTime = null;
  },
};

// =============================================================================
// TOKEN USAGE TRACKING
// =============================================================================

/**
 * Tracks token usage to help monitor costs and prevent runaway spending.
 * This is a simple in-memory tracker; for production, consider persisting
 * to a database or using a dedicated monitoring service.
 */
const tokenTracker = {
  totalInputTokens: 0,
  totalOutputTokens: 0,
  requestCount: 0,
  windowStartTime: Date.now(),
  windowDurationMs: 60 * 60 * 1000, // 1 hour window

  /**
   * Records token usage from an API response.
   *
   * @param {number} inputTokens - Tokens used for the prompt
   * @param {number} outputTokens - Tokens used for the response
   */
  recordUsage(inputTokens, outputTokens) {
    // Reset window if expired
    if (Date.now() - this.windowStartTime > this.windowDurationMs) {
      this.reset();
    }

    this.totalInputTokens += inputTokens;
    this.totalOutputTokens += outputTokens;
    this.requestCount++;
  },

  /**
   * Gets current usage statistics.
   *
   * @returns {Object} Current token usage stats
   */
  getStats() {
    return {
      inputTokens: this.totalInputTokens,
      outputTokens: this.totalOutputTokens,
      totalTokens: this.totalInputTokens + this.totalOutputTokens,
      requestCount: this.requestCount,
      windowStartTime: new Date(this.windowStartTime).toISOString(),
      estimatedCost: this.estimateCost(),
    };
  },

  /**
   * Estimates cost based on current usage.
   * NOTE: Prices are approximate and may change. Update as needed.
   *
   * @returns {string} Estimated cost in USD
   */
  estimateCost() {
    // Approximate prices per 1M tokens (as of 2024, update as needed)
    // These vary by model - using Sonnet prices as default
    const inputPricePer1M = 3.00;   // $3 per 1M input tokens
    const outputPricePer1M = 15.00; // $15 per 1M output tokens

    const inputCost = (this.totalInputTokens / 1_000_000) * inputPricePer1M;
    const outputCost = (this.totalOutputTokens / 1_000_000) * outputPricePer1M;

    return `$${(inputCost + outputCost).toFixed(4)}`;
  },

  /**
   * Resets the tracker for a new window.
   */
  reset() {
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.requestCount = 0;
    this.windowStartTime = Date.now();
  },
};

// =============================================================================
// CLIENT INITIALIZATION
// =============================================================================

/**
 * Initialize the Anthropic client with the API key from configuration.
 * The client is created once and reused for all requests (singleton pattern).
 *
 * NOTE: We don't initialize the client if the API key is missing.
 * This allows the app to start and return appropriate errors.
 */
let anthropicClient = null;

/**
 * Gets or creates the Anthropic client instance.
 * Uses lazy initialization to defer client creation until first use.
 *
 * @returns {Anthropic} The Anthropic client instance
 * @throws {Error} If the API key is not configured
 */
function getClient() {
  // Defensive check: Ensure API key exists before creating client
  if (!config.anthropic.apiKey) {
    throw new Error('Anthropic API key is not configured. Set ANTHROPIC_API_KEY in your .env file.');
  }

  // Lazy initialization: Create client only when first needed
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: config.anthropic.apiKey,
      // Set reasonable timeouts to prevent hanging requests
      timeout: 60000,        // 60 second timeout for requests
      maxRetries: 0,         // We handle retries ourselves for more control
    });
  }

  return anthropicClient;
}

// =============================================================================
// RETRY LOGIC
// =============================================================================

/**
 * Calculates the delay before the next retry attempt.
 * Uses exponential backoff with jitter to prevent thundering herd.
 *
 * @param {number} attempt - Current attempt number (0-indexed)
 * @returns {number} Delay in milliseconds
 */
function calculateRetryDelay(attempt) {
  // Exponential backoff: delay doubles each attempt
  const exponentialDelay = RETRY_CONFIG.baseDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt);

  // Cap at maximum delay
  const cappedDelay = Math.min(exponentialDelay, RETRY_CONFIG.maxDelayMs);

  // Add jitter (random variation) to prevent all retries happening simultaneously
  const jitter = cappedDelay * RETRY_CONFIG.jitterFactor * Math.random();

  return Math.floor(cappedDelay + jitter);
}

/**
 * Determines if an error is retryable.
 *
 * @param {Error} error - The error to check
 * @returns {boolean} True if the error is safe to retry
 */
function isRetryableError(error) {
  // Check for retryable HTTP status codes
  if (error.status && RETRYABLE_STATUS_CODES.includes(error.status)) {
    return true;
  }

  // Check for retryable network error codes
  if (error.code && RETRYABLE_ERROR_CODES.includes(error.code)) {
    return true;
  }

  // Check for timeout errors
  if (error.message && (
    error.message.includes('timeout') ||
    error.message.includes('ETIMEDOUT') ||
    error.message.includes('socket hang up')
  )) {
    return true;
  }

  return false;
}

/**
 * Sleeps for the specified duration.
 * Used for retry delays.
 *
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// MAIN API FUNCTION
// =============================================================================

/**
 * Sends a message to Claude and returns the response.
 * This is the core function for all Claude API interactions.
 *
 * FEATURES:
 * - Input validation before API calls
 * - Automatic retry with exponential backoff
 * - Circuit breaker to prevent cascade failures
 * - Token usage tracking
 * - Detailed error handling
 *
 * @param {Object} options - The options for the API call
 * @param {string} options.prompt - The user message/prompt to send to Claude
 * @param {string} [options.systemPrompt] - Optional system prompt to set context
 * @param {string} [options.model] - Optional model override (defaults to config)
 * @param {number} [options.maxTokens] - Optional max tokens override (defaults to config)
 * @param {number} [options.temperature] - Optional temperature (0-1, controls randomness)
 * @param {string} [options.requestId] - Optional request ID for tracking/debugging
 *
 * @returns {Promise<Object>} The API response with content and metadata
 * @throws {Error} If the API call fails after all retries
 */
async function sendMessage(options) {
  // ---------------------------------------------------------------------------
  // Input Validation
  // ---------------------------------------------------------------------------

  // Destructure options with defaults from configuration
  const {
    prompt,
    systemPrompt,
    model = config.anthropic.defaultModel,
    maxTokens = config.anthropic.defaultMaxTokens,
    temperature = 0.7, // Default temperature for balanced creativity
    requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  } = options;

  // Validate required prompt
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    throw new Error('Prompt is required and must be a non-empty string');
  }

  // SECURITY: Validate prompt length to prevent token abuse
  // This is a character limit; actual token count may vary
  const maxPromptLength = config.anthropic.maxPromptLength || 50000;
  if (prompt.length > maxPromptLength) {
    throw new Error(`Prompt exceeds maximum length of ${maxPromptLength} characters`);
  }

  // Validate model is in our allowed list (security: prevent unauthorized model access)
  if (!isValidModel(model)) {
    throw new Error(
      `Invalid model: "${model}". Valid models are: ${config.anthropic.validModels.join(', ')}`
    );
  }

  // Validate and enforce maxTokens limits
  // COST PROTECTION: Cap maxTokens to prevent runaway token usage
  const parsedMaxTokens = parseInt(maxTokens, 10);
  const hardMaxTokens = config.anthropic.hardMaxTokens || 4096; // Hard cap

  if (isNaN(parsedMaxTokens) || parsedMaxTokens < 1) {
    throw new Error('maxTokens must be a positive number');
  }

  // Enforce hard cap silently (use the lower of requested vs hard cap)
  const effectiveMaxTokens = Math.min(parsedMaxTokens, hardMaxTokens);

  // Validate temperature is within acceptable range
  const parsedTemperature = parseFloat(temperature);
  if (isNaN(parsedTemperature) || parsedTemperature < 0 || parsedTemperature > 1) {
    throw new Error('temperature must be a number between 0 and 1');
  }

  // Validate system prompt length if provided
  if (systemPrompt) {
    const maxSystemPromptLength = config.anthropic.maxSystemPromptLength || 10000;
    if (typeof systemPrompt !== 'string') {
      throw new Error('systemPrompt must be a string');
    }
    if (systemPrompt.length > maxSystemPromptLength) {
      throw new Error(`System prompt exceeds maximum length of ${maxSystemPromptLength} characters`);
    }
  }

  // ---------------------------------------------------------------------------
  // Circuit Breaker Check
  // ---------------------------------------------------------------------------

  // Check if circuit breaker allows this request
  circuitBreaker.canRequest(); // Throws if circuit is open

  // ---------------------------------------------------------------------------
  // API Call with Retry Logic
  // ---------------------------------------------------------------------------

  let lastError = null;

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      // Log retry attempts (useful for debugging)
      if (attempt > 0) {
        console.info(`[${requestId}] Retry attempt ${attempt}/${RETRY_CONFIG.maxRetries}`);
      }

      // Get the Anthropic client (will throw if not configured)
      const client = getClient();

      // Build the API request parameters
      const requestParams = {
        model: model,
        max_tokens: effectiveMaxTokens,
        temperature: parsedTemperature,
        messages: [
          {
            role: 'user',
            content: prompt.trim(),
          },
        ],
      };

      // Add system prompt if provided
      // System prompts set the behavior and context for Claude
      if (systemPrompt && systemPrompt.trim().length > 0) {
        requestParams.system = systemPrompt.trim();
      }

      // Make the API call
      const response = await client.messages.create(requestParams);

      // ---------------------------------------------------------------------------
      // Response Processing
      // ---------------------------------------------------------------------------

      // Record success with circuit breaker
      circuitBreaker.recordSuccess();

      // Track token usage
      const inputTokens = response.usage?.input_tokens || 0;
      const outputTokens = response.usage?.output_tokens || 0;
      tokenTracker.recordUsage(inputTokens, outputTokens);

      // Extract the text content from the response
      // Claude returns an array of content blocks; we want the text
      const textContent = response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n');

      // Return a structured response with useful metadata
      return {
        success: true,
        content: textContent,
        metadata: {
          requestId: requestId,
          model: response.model,
          inputTokens: inputTokens,
          outputTokens: outputTokens,
          totalTokens: inputTokens + outputTokens,
          stopReason: response.stop_reason,
          // Include if response was truncated due to token limit
          truncated: response.stop_reason === 'max_tokens',
        },
      };

    } catch (error) {
      lastError = error;

      // Record failure with circuit breaker
      circuitBreaker.recordFailure();

      // Check if this error is retryable
      if (!isRetryableError(error)) {
        // Non-retryable error, throw immediately
        break;
      }

      // Check if we have retries remaining
      if (attempt < RETRY_CONFIG.maxRetries) {
        const delay = calculateRetryDelay(attempt);
        console.warn(
          `[${requestId}] Retryable error (${error.status || error.code || 'unknown'}): ` +
          `${error.message}. Retrying in ${delay}ms...`
        );
        await sleep(delay);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Error Handling (all retries exhausted)
  // ---------------------------------------------------------------------------

  // Re-throw our own validation errors as-is
  if (lastError.message.includes('Prompt is required') ||
      lastError.message.includes('Prompt exceeds maximum') ||
      lastError.message.includes('Invalid model') ||
      lastError.message.includes('maxTokens must be') ||
      lastError.message.includes('temperature must be') ||
      lastError.message.includes('System prompt exceeds') ||
      lastError.message.includes('systemPrompt must be') ||
      lastError.message.includes('API key is not configured') ||
      lastError.message.includes('circuit breaker')) {
    throw lastError;
  }

  // Handle Anthropic-specific errors with user-friendly messages
  if (lastError.status) {
    switch (lastError.status) {
      case 400:
        throw new Error(`Bad request to Claude API: ${lastError.message}`);
      case 401:
        throw new Error('Invalid Anthropic API key. Please check your ANTHROPIC_API_KEY.');
      case 403:
        throw new Error('Access forbidden. Your API key may not have access to this model.');
      case 429:
        throw new Error(
          'Rate limit exceeded after retries. Please try again later. ' +
          'Consider implementing request queuing for high-volume applications.'
        );
      case 500:
      case 502:
      case 503:
        throw new Error(
          'Claude API is temporarily unavailable after multiple retry attempts. ' +
          'Please try again later.'
        );
      default:
        throw new Error(`Claude API error (${lastError.status}): ${lastError.message}`);
    }
  }

  // Handle network or other errors
  if (lastError.code === 'ENOTFOUND' || lastError.code === 'ECONNREFUSED') {
    throw new Error(
      'Unable to connect to Claude API after multiple attempts. ' +
      'Please check your internet connection.'
    );
  }

  // Fallback for unknown errors
  throw new Error(`Failed to communicate with Claude API: ${lastError.message}`);
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Convenience function for simple prompts without system context.
 * Useful for quick, straightforward API calls.
 *
 * @param {string} prompt - The prompt to send
 * @param {Object} [options] - Optional parameters (model, maxTokens, temperature)
 * @returns {Promise<Object>} The API response
 */
async function simplePrompt(prompt, options = {}) {
  return sendMessage({
    prompt,
    ...options,
  });
}

/**
 * Convenience function for prompts with a system context.
 * Useful for setting up Claude's behavior before the user message.
 *
 * @param {string} systemPrompt - The system prompt setting context
 * @param {string} prompt - The user prompt
 * @param {Object} [options] - Optional parameters (model, maxTokens, temperature)
 * @returns {Promise<Object>} The API response
 */
async function promptWithSystem(systemPrompt, prompt, options = {}) {
  return sendMessage({
    systemPrompt,
    prompt,
    ...options,
  });
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  // Main API functions
  sendMessage,
  simplePrompt,
  promptWithSystem,

  // Utilities for monitoring and testing
  getClient,
  getTokenStats: () => tokenTracker.getStats(),
  resetTokenStats: () => tokenTracker.reset(),
  getCircuitBreakerState: () => ({
    state: circuitBreaker.state,
    failures: circuitBreaker.failures,
    lastFailureTime: circuitBreaker.lastFailureTime,
  }),
  resetCircuitBreaker: () => circuitBreaker.reset(),

  // Constants for testing
  RETRY_CONFIG,
  RETRYABLE_STATUS_CODES,
};
