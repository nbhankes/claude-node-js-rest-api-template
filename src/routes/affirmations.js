/**
 * =============================================================================
 * AFFIRMATIONS ROUTES
 * =============================================================================
 *
 * This module contains routes for positive and negative (humorous) affirmations.
 * These endpoints demonstrate both GET and POST request patterns with Claude AI.
 *
 * BEST PRACTICES DEMONSTRATED:
 * - RESTful route design
 * - Both GET and POST patterns for the same functionality
 * - Input validation and sanitization
 * - Defensive programming with try-catch
 * - Consistent response formatting
 * - System prompts for consistent AI behavior
 *
 * =============================================================================
 */

const express = require('express');
const router = express.Router();
const { promptWithSystem } = require('../services/claudeService');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateGetParams, validatePostParams, extractParams } = require('../middleware/validation');

/**
 * System prompts define Claude's behavior for each endpoint.
 * These are carefully crafted to produce consistent, appropriate responses.
 *
 * IMPORTANT: System prompts are crucial for:
 * - Setting the tone and style of responses
 * - Constraining Claude to appropriate content
 * - Ensuring consistent output format
 */
const SYSTEM_PROMPTS = {
  positiveAffirmation: `You are a supportive, warm, and encouraging life coach.
Your task is to generate ONE positive affirmation that is:
- Uplifting and empowering
- Personal and relatable
- Focused on self-worth, growth, or resilience
- Written in first person (starting with "I am", "I can", "I have", etc.)

If a context or emotion is provided, tailor the affirmation to that specific situation.
Respond with ONLY the affirmation itself - no explanations, no quotation marks, no preamble.`,

  negativeAffirmation: `You are a dry, sarcastic comedian who gives hilariously pessimistic "affirmations."
Your task is to generate ONE humorous negative affirmation that is:
- Darkly funny but never cruel or truly harmful
- Self-deprecating in a relatable way
- Written in first or second person
- Clearly satirical and over-the-top

Examples of the tone:
- "You should probably just go back to bed."
- "Your potential is limited, and that's okay."
- "Today is a great day to lower your expectations."
- "Embrace mediocrity - it's less work."

If a context is provided, make it relevant but keep it lighthearted.
Respond with ONLY the affirmation itself - no explanations, no quotation marks, no preamble.`,
};

// =============================================================================
// POSITIVE AFFIRMATION ENDPOINTS
// =============================================================================

/**
 * GET /api/affirmations/positive
 *
 * Returns a positive affirmation from Claude.
 *
 * Query Parameters (all optional):
 * - context: Additional context for personalization (e.g., "job interview")
 * - emotion: Current emotion (happy, sad, anxious, etc.)
 * - model: Claude model to use
 * - maxTokens: Maximum response length
 * - temperature: Creativity level (0-1)
 *
 * Example: GET /api/affirmations/positive?emotion=anxious&context=job+interview
 */
router.get(
  '/positive',
  validateGetParams, // Apply validation middleware
  asyncHandler(async (req, res) => {
    // Extract and validate parameters from the request
    const { model, maxTokens, temperature, context, emotion } = extractParams(req);

    // Build a contextual prompt if context/emotion provided
    let userPrompt = 'Generate a positive affirmation.';

    if (emotion) {
      userPrompt = `Generate a positive affirmation for someone feeling ${emotion}.`;
    }

    if (context) {
      userPrompt += ` Context: ${context}`;
    }

    // Call Claude API with system prompt for consistent behavior
    const response = await promptWithSystem(
      SYSTEM_PROMPTS.positiveAffirmation,
      userPrompt,
      { model, maxTokens, temperature }
    );

    // Return standardized success response
    res.json({
      success: true,
      type: 'positive',
      affirmation: response.content,
      metadata: {
        model: response.metadata.model,
        tokens: {
          input: response.metadata.inputTokens,
          output: response.metadata.outputTokens,
        },
      },
      // Include request params in response for debugging/transparency
      requestParams: {
        emotion: emotion || null,
        context: context || null,
      },
    });
  })
);

/**
 * POST /api/affirmations/positive
 *
 * Returns a positive affirmation from Claude.
 * POST allows for more complex/longer context in the request body.
 *
 * Request Body (all optional):
 * - context: Additional context for personalization
 * - emotion: Current emotion
 * - model: Claude model to use
 * - maxTokens: Maximum response length
 * - temperature: Creativity level (0-1)
 *
 * Example Body:
 * {
 *   "emotion": "anxious",
 *   "context": "I have a big presentation tomorrow and I'm nervous",
 *   "temperature": 0.8
 * }
 */
router.post(
  '/positive',
  validatePostParams, // Apply validation middleware for POST body
  asyncHandler(async (req, res) => {
    // Extract parameters (same logic works for both query and body)
    const { model, maxTokens, temperature, context, emotion } = extractParams(req);

    // Build contextual prompt
    let userPrompt = 'Generate a positive affirmation.';

    if (emotion) {
      userPrompt = `Generate a positive affirmation for someone feeling ${emotion}.`;
    }

    if (context) {
      userPrompt += ` Context: ${context}`;
    }

    // Call Claude API
    const response = await promptWithSystem(
      SYSTEM_PROMPTS.positiveAffirmation,
      userPrompt,
      { model, maxTokens, temperature }
    );

    // Return success response
    res.json({
      success: true,
      type: 'positive',
      affirmation: response.content,
      metadata: {
        model: response.metadata.model,
        tokens: {
          input: response.metadata.inputTokens,
          output: response.metadata.outputTokens,
        },
      },
      requestParams: {
        emotion: emotion || null,
        context: context || null,
      },
    });
  })
);

// =============================================================================
// NEGATIVE (HUMOROUS) AFFIRMATION ENDPOINTS
// =============================================================================

/**
 * GET /api/affirmations/negative
 *
 * Returns a humorous "negative" affirmation from Claude.
 * These are meant to be funny and self-deprecating, not genuinely harmful.
 *
 * Query Parameters (all optional):
 * - context: Topic for the humor (e.g., "monday morning")
 * - model: Claude model to use
 * - maxTokens: Maximum response length
 * - temperature: Creativity level (0-1, higher = more creative)
 *
 * Example: GET /api/affirmations/negative?context=monday+morning&temperature=0.9
 */
router.get(
  '/negative',
  validateGetParams,
  asyncHandler(async (req, res) => {
    const { model, maxTokens, temperature, context } = extractParams(req);

    // Build prompt with optional context
    let userPrompt = 'Generate a humorous negative affirmation.';

    if (context) {
      userPrompt = `Generate a humorous negative affirmation about: ${context}`;
    }

    // Higher default temperature for more creative/funny responses
    const actualTemperature = temperature ?? 0.9;

    const response = await promptWithSystem(
      SYSTEM_PROMPTS.negativeAffirmation,
      userPrompt,
      { model, maxTokens, temperature: actualTemperature }
    );

    res.json({
      success: true,
      type: 'negative',
      affirmation: response.content,
      metadata: {
        model: response.metadata.model,
        tokens: {
          input: response.metadata.inputTokens,
          output: response.metadata.outputTokens,
        },
      },
      requestParams: {
        context: context || null,
      },
      // Add a disclaimer since these are meant to be humorous
      disclaimer: 'This is a humorous affirmation meant for entertainment purposes only.',
    });
  })
);

/**
 * POST /api/affirmations/negative
 *
 * Returns a humorous "negative" affirmation from Claude.
 *
 * Request Body (all optional):
 * - context: Topic for the humor
 * - model: Claude model to use
 * - maxTokens: Maximum response length
 * - temperature: Creativity level (0-1)
 */
router.post(
  '/negative',
  validatePostParams,
  asyncHandler(async (req, res) => {
    const { model, maxTokens, temperature, context } = extractParams(req);

    let userPrompt = 'Generate a humorous negative affirmation.';

    if (context) {
      userPrompt = `Generate a humorous negative affirmation about: ${context}`;
    }

    const actualTemperature = temperature ?? 0.9;

    const response = await promptWithSystem(
      SYSTEM_PROMPTS.negativeAffirmation,
      userPrompt,
      { model, maxTokens, temperature: actualTemperature }
    );

    res.json({
      success: true,
      type: 'negative',
      affirmation: response.content,
      metadata: {
        model: response.metadata.model,
        tokens: {
          input: response.metadata.inputTokens,
          output: response.metadata.outputTokens,
        },
      },
      requestParams: {
        context: context || null,
      },
      disclaimer: 'This is a humorous affirmation meant for entertainment purposes only.',
    });
  })
);

// Export the router
module.exports = router;
