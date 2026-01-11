/**
 * =============================================================================
 * EMOTIONS ROUTES
 * =============================================================================
 *
 * This module contains routes for emotion-related AI interactions including:
 * - Mood analysis and support
 * - Emotional wellness tips
 * - Motivational quotes
 * - Custom emotional prompts
 *
 * BEST PRACTICES DEMONSTRATED:
 * - Multiple endpoint patterns (analysis, generation, custom)
 * - Custom validation for specific routes
 * - Response streaming considerations
 * - Error handling in async contexts
 *
 * =============================================================================
 */

const express = require('express');
const router = express.Router();
const { promptWithSystem, sendMessage } = require('../services/claudeService');
const { asyncHandler, Errors } = require('../middleware/errorHandler');
const {
  validateGetParams,
  validatePostParams,
  validatePostWithPrompt,
  extractParams,
  validEmotions,
} = require('../middleware/validation');

/**
 * System prompts for emotion-related endpoints.
 */
const SYSTEM_PROMPTS = {
  moodSupport: `You are an empathetic and supportive emotional wellness assistant.
Your role is to provide gentle, helpful support to someone experiencing the specified emotion.

Guidelines:
- Acknowledge their feelings without judgment
- Offer 2-3 practical, actionable suggestions
- Keep responses warm but concise (2-3 paragraphs max)
- If the emotion is concerning (very sad, very anxious), gently suggest professional resources
- Never diagnose or provide medical advice

Format your response as:
1. Acknowledgment of the feeling
2. Brief supportive message
3. 2-3 practical suggestions`,

  motivationalQuote: `You are a motivational speaker and quote curator.
Generate an inspiring quote that is:
- Original OR from a well-known figure (attribute if from someone)
- Relevant to the context or emotion if provided
- Genuinely motivating, not cliché
- Between 1-3 sentences

Respond with the quote, followed by the attribution on a new line if applicable.
Do not add any preamble or explanation.`,

  wellnessTip: `You are a wellness and self-care expert.
Provide ONE practical wellness tip that is:
- Actionable and specific
- Backed by general wellness principles
- Easy to implement today
- Related to the context/emotion if provided

Format: Brief explanation of the tip (2-3 sentences), followed by a simple action step.
Do not include medical advice or diagnoses.`,

  emotionAnalysis: `You are an emotional intelligence expert.
Analyze the provided text for emotional content and provide:
1. Primary emotion detected
2. Intensity level (low, moderate, high)
3. Suggested supportive response type
4. Brief reasoning (1-2 sentences)

Respond in this exact JSON format:
{
  "primaryEmotion": "emotion name",
  "intensity": "low|moderate|high",
  "suggestedResponse": "affirmation|support|celebration|comfort",
  "reasoning": "Brief explanation"
}`,
};

// =============================================================================
// MOOD SUPPORT ENDPOINT
// =============================================================================

/**
 * GET /api/emotions/support
 *
 * Provides supportive content based on the user's current emotion.
 *
 * Query Parameters:
 * - emotion: (required) Current emotion from validEmotions list
 * - context: (optional) Additional context
 * - model, maxTokens, temperature: (optional) API parameters
 *
 * Example: GET /api/emotions/support?emotion=anxious&context=upcoming+exam
 */
router.get(
  '/support',
  validateGetParams,
  asyncHandler(async (req, res) => {
    const { model, maxTokens, temperature, context, emotion } = extractParams(req);

    // Emotion is required for this endpoint
    if (!emotion) {
      throw Errors.badRequest(
        'emotion parameter is required',
        { validEmotions: validEmotions }
      );
    }

    // Build the prompt
    let userPrompt = `Provide supportive content for someone feeling ${emotion}.`;

    if (context) {
      userPrompt += ` Additional context: ${context}`;
    }

    const response = await promptWithSystem(
      SYSTEM_PROMPTS.moodSupport,
      userPrompt,
      { model, maxTokens: maxTokens || 500, temperature: temperature || 0.7 }
    );

    res.json({
      success: true,
      emotion: emotion,
      support: response.content,
      metadata: {
        model: response.metadata.model,
        tokens: {
          input: response.metadata.inputTokens,
          output: response.metadata.outputTokens,
        },
      },
    });
  })
);

/**
 * POST /api/emotions/support
 *
 * POST version allows for longer context descriptions.
 *
 * Request Body:
 * - emotion: (required) Current emotion
 * - context: (optional) Detailed context
 * - model, maxTokens, temperature: (optional) API parameters
 */
router.post(
  '/support',
  validatePostParams,
  asyncHandler(async (req, res) => {
    const { model, maxTokens, temperature, context, emotion } = extractParams(req);

    if (!emotion) {
      throw Errors.badRequest(
        'emotion field is required in request body',
        { validEmotions: validEmotions }
      );
    }

    let userPrompt = `Provide supportive content for someone feeling ${emotion}.`;

    if (context) {
      userPrompt += ` Additional context: ${context}`;
    }

    const response = await promptWithSystem(
      SYSTEM_PROMPTS.moodSupport,
      userPrompt,
      { model, maxTokens: maxTokens || 500, temperature: temperature || 0.7 }
    );

    res.json({
      success: true,
      emotion: emotion,
      support: response.content,
      metadata: {
        model: response.metadata.model,
        tokens: {
          input: response.metadata.inputTokens,
          output: response.metadata.outputTokens,
        },
      },
    });
  })
);

// =============================================================================
// MOTIVATIONAL QUOTE ENDPOINT
// =============================================================================

/**
 * GET /api/emotions/motivational-quote
 *
 * Returns an inspirational quote, optionally tailored to context/emotion.
 *
 * Query Parameters (all optional):
 * - context: Topic for the quote (e.g., "perseverance", "new beginnings")
 * - emotion: Current emotion to tailor the quote
 * - model, maxTokens, temperature: API parameters
 */
router.get(
  '/motivational-quote',
  validateGetParams,
  asyncHandler(async (req, res) => {
    const { model, maxTokens, temperature, context, emotion } = extractParams(req);

    let userPrompt = 'Generate an inspiring motivational quote.';

    if (emotion) {
      userPrompt = `Generate an inspiring quote for someone feeling ${emotion}.`;
    }

    if (context) {
      userPrompt += ` Theme: ${context}`;
    }

    const response = await promptWithSystem(
      SYSTEM_PROMPTS.motivationalQuote,
      userPrompt,
      { model, maxTokens: maxTokens || 200, temperature: temperature || 0.8 }
    );

    res.json({
      success: true,
      quote: response.content,
      context: context || null,
      emotion: emotion || null,
      metadata: {
        model: response.metadata.model,
        tokens: {
          input: response.metadata.inputTokens,
          output: response.metadata.outputTokens,
        },
      },
    });
  })
);

// =============================================================================
// WELLNESS TIP ENDPOINT
// =============================================================================

/**
 * GET /api/emotions/wellness-tip
 *
 * Returns a practical wellness tip.
 *
 * Query Parameters (all optional):
 * - emotion: Current emotion for tailored advice
 * - context: Specific area (e.g., "sleep", "stress", "energy")
 * - model, maxTokens, temperature: API parameters
 */
router.get(
  '/wellness-tip',
  validateGetParams,
  asyncHandler(async (req, res) => {
    const { model, maxTokens, temperature, context, emotion } = extractParams(req);

    let userPrompt = 'Provide a practical wellness tip.';

    if (emotion) {
      userPrompt = `Provide a wellness tip for someone feeling ${emotion}.`;
    }

    if (context) {
      userPrompt += ` Focus area: ${context}`;
    }

    const response = await promptWithSystem(
      SYSTEM_PROMPTS.wellnessTip,
      userPrompt,
      { model, maxTokens: maxTokens || 300, temperature: temperature || 0.7 }
    );

    res.json({
      success: true,
      tip: response.content,
      focus: context || 'general',
      emotion: emotion || null,
      metadata: {
        model: response.metadata.model,
        tokens: {
          input: response.metadata.inputTokens,
          output: response.metadata.outputTokens,
        },
      },
    });
  })
);

// =============================================================================
// EMOTION ANALYSIS ENDPOINT
// =============================================================================

/**
 * POST /api/emotions/analyze
 *
 * Analyzes text for emotional content and suggests appropriate responses.
 * This endpoint requires a POST since it needs text input to analyze.
 *
 * Request Body:
 * - prompt: (required) Text to analyze for emotional content
 * - model, maxTokens, temperature: (optional) API parameters
 *
 * Example Body:
 * {
 *   "prompt": "I just got the promotion I've been working towards for two years!"
 * }
 */
router.post(
  '/analyze',
  validatePostWithPrompt,
  asyncHandler(async (req, res) => {
    const { model, maxTokens, temperature, prompt } = extractParams(req);

    const response = await promptWithSystem(
      SYSTEM_PROMPTS.emotionAnalysis,
      `Analyze the emotional content of this text: "${prompt}"`,
      { model, maxTokens: maxTokens || 300, temperature: temperature || 0.3 } // Lower temp for analysis
    );

    // Attempt to parse the JSON response
    let analysis;
    try {
      // Find JSON in the response (Claude might include extra text)
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      // If JSON parsing fails, return the raw response
      // This is defensive - we handle cases where Claude doesn't format as expected
      analysis = {
        rawResponse: response.content,
        parseError: 'Could not parse structured response',
      };
    }

    res.json({
      success: true,
      analysis: analysis,
      originalText: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''), // Truncate for privacy
      metadata: {
        model: response.metadata.model,
        tokens: {
          input: response.metadata.inputTokens,
          output: response.metadata.outputTokens,
        },
      },
    });
  })
);

// =============================================================================
// CUSTOM PROMPT ENDPOINT
// =============================================================================

/**
 * POST /api/emotions/custom
 *
 * Allows users to send custom emotion-related prompts to Claude.
 * This is a more flexible endpoint for advanced use cases.
 *
 * Request Body:
 * - prompt: (required) Custom prompt text
 * - model, maxTokens, temperature: (optional) API parameters
 *
 * NOTE: This endpoint uses a general emotional wellness system prompt
 * to keep responses appropriate for the API's theme.
 */
router.post(
  '/custom',
  validatePostWithPrompt,
  asyncHandler(async (req, res) => {
    const { model, maxTokens, temperature, prompt } = extractParams(req);

    // Use a general wellness-focused system prompt
    const systemPrompt = `You are a helpful emotional wellness assistant.
Respond helpfully to the user's prompt while maintaining a supportive, positive tone.
Keep responses concise and actionable when appropriate.
Do not provide medical advice or diagnoses.`;

    const response = await promptWithSystem(
      systemPrompt,
      prompt,
      { model, maxTokens, temperature }
    );

    res.json({
      success: true,
      response: response.content,
      metadata: {
        model: response.metadata.model,
        tokens: {
          input: response.metadata.inputTokens,
          output: response.metadata.outputTokens,
        },
      },
    });
  })
);

// Export the router
module.exports = router;
