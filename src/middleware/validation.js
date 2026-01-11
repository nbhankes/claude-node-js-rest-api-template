/**
 * =============================================================================
 * VALIDATION MIDDLEWARE
 * =============================================================================
 *
 * This module provides input validation for API requests using express-validator.
 * Proper validation is crucial for security and preventing invalid data from
 * reaching your business logic.
 *
 * BEST PRACTICES DEMONSTRATED:
 * - Input validation at the API boundary
 * - Reusable validation chains
 * - Clear, user-friendly error messages
 * - Sanitization of user input
 * - Type coercion for query parameters
 *
 * =============================================================================
 */

const { body, query, validationResult } = require('express-validator');
const { config } = require('../config');

/**
 * Middleware to handle validation results.
 * If validation fails, returns a 400 error with detailed messages.
 * If validation passes, continues to the next middleware.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
function handleValidationErrors(req, res, next) {
  // Get validation errors from the request
  const errors = validationResult(req);

  // If there are no errors, continue to the next middleware
  if (errors.isEmpty()) {
    return next();
  }

  // Format errors into a user-friendly structure
  const formattedErrors = errors.array().map((error) => ({
    field: error.path,
    message: error.msg,
    value: error.value,
  }));

  // Return 400 Bad Request with error details
  return res.status(400).json({
    success: false,
    error: 'Validation failed',
    details: formattedErrors,
  });
}

/**
 * Validation rules for optional API parameters.
 * These can be used in both GET (query) and POST (body) requests.
 */

// Validate model parameter (optional)
const validateModelQuery = query('model')
  .optional()
  .isString()
  .trim()
  .isIn(config.anthropic.validModels)
  .withMessage(`Model must be one of: ${config.anthropic.validModels.join(', ')}`);

const validateModelBody = body('model')
  .optional()
  .isString()
  .trim()
  .isIn(config.anthropic.validModels)
  .withMessage(`Model must be one of: ${config.anthropic.validModels.join(', ')}`);

// Validate maxTokens parameter (optional)
const validateMaxTokensQuery = query('maxTokens')
  .optional()
  .isInt({ min: 1, max: 8192 })
  .withMessage('maxTokens must be an integer between 1 and 8192')
  .toInt(); // Convert string to integer

const validateMaxTokensBody = body('maxTokens')
  .optional()
  .isInt({ min: 1, max: 8192 })
  .withMessage('maxTokens must be an integer between 1 and 8192')
  .toInt();

// Validate temperature parameter (optional)
const validateTemperatureQuery = query('temperature')
  .optional()
  .isFloat({ min: 0, max: 1 })
  .withMessage('temperature must be a number between 0 and 1')
  .toFloat(); // Convert string to float

const validateTemperatureBody = body('temperature')
  .optional()
  .isFloat({ min: 0, max: 1 })
  .withMessage('temperature must be a number between 0 and 1')
  .toFloat();

// Validate prompt/message in POST body (required for custom prompts)
const validatePromptBody = body('prompt')
  .exists({ checkFalsy: true })
  .withMessage('prompt is required')
  .isString()
  .withMessage('prompt must be a string')
  .trim()
  .isLength({ min: 1, max: 10000 })
  .withMessage('prompt must be between 1 and 10000 characters');

// Validate optional context/topic parameter
const validateContextQuery = query('context')
  .optional()
  .isString()
  .trim()
  .isLength({ max: 500 })
  .withMessage('context must be at most 500 characters')
  .escape(); // Sanitize to prevent XSS

const validateContextBody = body('context')
  .optional()
  .isString()
  .trim()
  .isLength({ max: 500 })
  .withMessage('context must be at most 500 characters');

// Validate emotion/mood parameter
const validEmotions = ['happy', 'sad', 'anxious', 'angry', 'stressed', 'lonely', 'excited', 'neutral'];

const validateEmotionQuery = query('emotion')
  .optional()
  .isString()
  .trim()
  .toLowerCase()
  .isIn(validEmotions)
  .withMessage(`emotion must be one of: ${validEmotions.join(', ')}`);

const validateEmotionBody = body('emotion')
  .optional()
  .isString()
  .trim()
  .toLowerCase()
  .isIn(validEmotions)
  .withMessage(`emotion must be one of: ${validEmotions.join(', ')}`);

/**
 * Pre-built validation chains for common endpoint types.
 * Use these arrays directly in your route definitions.
 */

// Validation for GET endpoints with optional parameters
const validateGetParams = [
  validateModelQuery,
  validateMaxTokensQuery,
  validateTemperatureQuery,
  validateContextQuery,
  validateEmotionQuery,
  handleValidationErrors,
];

// Validation for POST endpoints with optional parameters
const validatePostParams = [
  validateModelBody,
  validateMaxTokensBody,
  validateTemperatureBody,
  validateContextBody,
  validateEmotionBody,
  handleValidationErrors,
];

// Validation for POST endpoints that require a prompt
const validatePostWithPrompt = [
  validatePromptBody,
  validateModelBody,
  validateMaxTokensBody,
  validateTemperatureBody,
  handleValidationErrors,
];

/**
 * Helper function to extract validated parameters from request.
 * Works with both query (GET) and body (POST) parameters.
 *
 * @param {Object} req - Express request object
 * @returns {Object} Extracted and validated parameters
 */
function extractParams(req) {
  // Merge query and body, with body taking precedence
  const params = {
    ...req.query,
    ...req.body,
  };

  return {
    model: params.model || config.anthropic.defaultModel,
    maxTokens: params.maxTokens || config.anthropic.defaultMaxTokens,
    temperature: params.temperature ?? 0.7, // Use nullish coalescing for 0
    context: params.context || null,
    emotion: params.emotion || null,
    prompt: params.prompt || null,
  };
}

// Export validation middleware and helpers
module.exports = {
  handleValidationErrors,
  validateGetParams,
  validatePostParams,
  validatePostWithPrompt,
  extractParams,
  validEmotions,
  // Export individual validators for custom combinations
  validators: {
    modelQuery: validateModelQuery,
    modelBody: validateModelBody,
    maxTokensQuery: validateMaxTokensQuery,
    maxTokensBody: validateMaxTokensBody,
    temperatureQuery: validateTemperatureQuery,
    temperatureBody: validateTemperatureBody,
    promptBody: validatePromptBody,
    contextQuery: validateContextQuery,
    contextBody: validateContextBody,
    emotionQuery: validateEmotionQuery,
    emotionBody: validateEmotionBody,
  },
};
