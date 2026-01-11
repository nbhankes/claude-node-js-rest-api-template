# Claude AI Emotions API Template

A production-ready Node.js REST API template integrating with the Anthropic Claude AI for emotion-based endpoints. This template demonstrates best practices for building secure, maintainable, and well-documented APIs.

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Getting Your Anthropic API Key](#getting-your-anthropic-api-key)
- [API Authentication](#api-authentication)
- [API Endpoints](#api-endpoints)
- [Example Requests](#example-requests)
- [Configuration Reference](#configuration-reference)
- [Security Features](#security-features)
- [Hosting Options](#hosting-options)
- [Project Structure](#project-structure)
- [Extending the Template](#extending-the-template)
- [Troubleshooting](#troubleshooting)

## Features

- **Emotion-Based Endpoints**: Positive affirmations, humorous negative affirmations, mood support, motivational quotes, wellness tips, and emotion analysis
- **GET & POST Examples**: Both HTTP methods demonstrated for flexibility
- **Production Security**: API key authentication, rate limiting, input validation, security headers
- **Cost Protection**: Hard token limits, dual rate limiting, usage tracking
- **Resilience**: Automatic retries with exponential backoff, circuit breaker pattern
- **Monitoring**: Health checks, readiness probes, token usage statistics
- **Heavily Commented**: Every file includes detailed comments explaining what the code does and why

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env and add your Anthropic API key
# Get your API key from: https://console.anthropic.com/
```

### 3. Start the Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

### 4. Test the API

```bash
# Health check
curl http://localhost:3000/health

# Get a positive affirmation
curl http://localhost:3000/api/affirmations/positive

# Get a humorous negative affirmation
curl http://localhost:3000/api/affirmations/negative

# Get mood support (POST example)
curl -X POST http://localhost:3000/api/emotions/support \
  -H "Content-Type: application/json" \
  -d '{"emotion": "anxious", "context": "job interview tomorrow"}'
```

## Getting Your Anthropic API Key

To use this API, you need an API key from Anthropic to access Claude.

### Step 1: Create an Anthropic Account

1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Click "Sign Up" and create an account
3. Verify your email address

### Step 2: Add Payment Method

1. Navigate to "Billing" in the console
2. Add a credit card or payment method
3. Anthropic uses pay-as-you-go pricing

### Step 3: Generate API Key

1. Go to "API Keys" in the console
2. Click "Create Key"
3. Give your key a descriptive name (e.g., "emotions-api-production")
4. Copy the key immediately - it won't be shown again!

### Step 4: Add Key to Your Environment

```bash
# In your .env file
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
```

### API Pricing (as of 2024)

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|-------|----------------------|------------------------|
| Claude 3.5 Sonnet | $3.00 | $15.00 |
| Claude 3.5 Haiku | $0.25 | $1.25 |
| Claude 3 Opus | $15.00 | $75.00 |

**Tip**: For cost-sensitive applications, use `claude-3-5-haiku-20241022` as your default model.

## API Authentication

This API supports optional API key authentication to protect your endpoints from unauthorized access.

### Enabling Authentication

Set these environment variables:

```bash
REQUIRE_API_KEY=true
API_KEY=your-secret-api-key-here
```

**Generating a secure API key:**

```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Using OpenSSL
openssl rand -hex 32

# Using Python
python -c "import secrets; print(secrets.token_hex(32))"
```

### Making Authenticated Requests

Include your API key in the `X-API-Key` header:

```bash
# With curl
curl -H "X-API-Key: your-secret-api-key-here" \
  http://localhost:3000/api/affirmations/positive

# With fetch (JavaScript)
fetch('http://localhost:3000/api/affirmations/positive', {
  headers: {
    'X-API-Key': 'your-secret-api-key-here'
  }
})
```

### Alternative Authentication Methods

The API also accepts keys via:

```bash
# Bearer token in Authorization header
curl -H "Authorization: Bearer your-secret-api-key-here" \
  http://localhost:3000/api/affirmations/positive

# Query parameter (less secure, use only when headers aren't possible)
curl "http://localhost:3000/api/affirmations/positive?api_key=your-secret-api-key-here"
```

### Distributing API Keys to Users

If you're hosting this API for others to use:

1. **Generate unique keys** for each user/application
2. **Store keys securely** in a database (hashed, like passwords)
3. **Implement key management** endpoints for creating/revoking keys
4. **Set usage limits** per key to prevent abuse
5. **Log key usage** for monitoring and billing

For a simple setup, you can use a single shared key. For production with multiple users, consider implementing a proper API key management system or using a service like:

- [Auth0](https://auth0.com/) - Full authentication platform
- [Clerk](https://clerk.com/) - Developer-friendly auth
- [AWS API Gateway](https://aws.amazon.com/api-gateway/) - Includes API key management
- [Kong](https://konghq.com/) - API gateway with key management

## API Endpoints

### Affirmations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/affirmations/positive` | Get a positive, uplifting affirmation |
| GET/POST | `/api/affirmations/negative` | Get a humorous "negative" affirmation |

### Emotions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/emotions/support` | Get supportive content for a specific emotion |
| GET | `/api/emotions/motivational-quote` | Get an inspirational quote |
| GET | `/api/emotions/wellness-tip` | Get a practical wellness tip |
| POST | `/api/emotions/analyze` | Analyze text for emotional content |
| POST | `/api/emotions/custom` | Send a custom emotion-related prompt |

### Monitoring & Utility

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Basic health check (for load balancers) |
| GET | `/health/detailed` | Detailed health with memory/uptime info |
| GET | `/health/ready` | Readiness probe (for Kubernetes) |
| GET | `/api/info` | Full API documentation |
| GET | `/api/models` | List available Claude models |
| GET | `/api/stats` | Token usage and circuit breaker status |

### Request Parameters

All Claude API endpoints accept these optional parameters (via query string for GET, body for POST):

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `model` | string | `claude-sonnet-4-20250514` | Claude model to use |
| `maxTokens` | integer | `1024` | Maximum response length (1-4096) |
| `temperature` | float | `0.7` | Creativity level (0-1) |
| `context` | string | - | Additional context for personalization (max 500 chars) |
| `emotion` | string | - | Current emotion (see valid emotions below) |

### Valid Emotions

`happy`, `sad`, `anxious`, `angry`, `stressed`, `lonely`, `excited`, `neutral`

## Example Requests

### GET Request with Parameters

```bash
curl "http://localhost:3000/api/affirmations/positive?emotion=anxious&temperature=0.8"
```

### POST Request with JSON Body

```bash
curl -X POST http://localhost:3000/api/emotions/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "I just got the promotion I have been working towards!",
    "model": "claude-sonnet-4-20250514",
    "temperature": 0.3
  }'
```

### Authenticated Request

```bash
curl -X POST http://localhost:3000/api/emotions/custom \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-api-key" \
  -d '{
    "prompt": "Give me a breathing exercise for stress relief",
    "maxTokens": 500
  }'
```

### Example Response

```json
{
  "success": true,
  "type": "positive",
  "affirmation": "I am capable of handling whatever challenges come my way today.",
  "metadata": {
    "model": "claude-sonnet-4-20250514",
    "tokens": {
      "input": 45,
      "output": 18
    }
  },
  "requestParams": {
    "emotion": "anxious",
    "context": null
  }
}
```

## Configuration Reference

### Required Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |

### API Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DEFAULT_MODEL` | `claude-sonnet-4-20250514` | Default Claude model |
| `DEFAULT_MAX_TOKENS` | `1024` | Default max response tokens |
| `HARD_MAX_TOKENS` | `4096` | Absolute maximum tokens (cost protection) |
| `MAX_PROMPT_LENGTH` | `50000` | Max input prompt characters |

### Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `NODE_ENV` | `development` | Environment mode |
| `REQUEST_TIMEOUT_MS` | `60000` | Request timeout in ms |
| `MAX_BODY_SIZE` | `10kb` | Maximum request body size |

### Security Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `REQUIRE_API_KEY` | `false` | Enable API key authentication |
| `API_KEY` | - | Your API key for client authentication |
| `CORS_ORIGIN` | `*` | Allowed CORS origins |
| `TRUST_PROXY` | `1` | Trusted proxy count |

### Rate Limiting

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_MAX` | `100` | Max requests per window (general) |
| `RATE_LIMIT_WINDOW_MINUTES` | `15` | Rate limit window |
| `CLAUDE_API_RATE_LIMIT_MAX` | `30` | Max Claude API requests per window |
| `CLAUDE_API_RATE_LIMIT_WINDOW_MINUTES` | `15` | Claude API rate limit window |

### Resilience Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `API_MAX_RETRIES` | `3` | Max retry attempts |
| `API_RETRY_BASE_DELAY_MS` | `1000` | Base retry delay |
| `CIRCUIT_BREAKER_THRESHOLD` | `5` | Failures before circuit opens |
| `CIRCUIT_BREAKER_RESET_MS` | `30000` | Time before circuit retry |

## Security Features

### Built-in Protection

- **Helmet**: Sets security HTTP headers (CSP, X-Frame-Options, etc.)
- **CORS**: Configurable cross-origin request handling
- **Rate Limiting**: Dual rate limiting (general + Claude API specific)
- **Input Validation**: All inputs validated and sanitized
- **Input Sanitization**: Removes null bytes, prevents prototype pollution
- **Error Handling**: Secure error messages (no stack traces in production)
- **Body Size Limits**: Prevents large payload attacks
- **Request Timeouts**: Prevents hanging requests
- **API Key Auth**: Optional authentication with timing-safe comparison

### Cost Protection

- **Hard Token Limit**: Absolute cap on response tokens
- **Prompt Length Limit**: Prevents extremely long inputs
- **Dedicated API Rate Limit**: Separate, stricter limit for Claude calls
- **Token Usage Tracking**: Monitor costs via `/api/stats`
- **Circuit Breaker**: Prevents runaway costs during outages

## Hosting Options

### Option 1: Railway (Recommended for Beginners)

[Railway](https://railway.app/) offers simple deployment with generous free tier.

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

**Pros**: Easy setup, automatic HTTPS, free tier available
**Cons**: Limited free tier, less control
**Cost**: Free tier, then ~$5/month

### Option 2: Render

[Render](https://render.com/) provides free web service hosting.

1. Connect your GitHub repository
2. Create a new "Web Service"
3. Set environment variables in dashboard
4. Deploy automatically on push

**Pros**: Free tier, automatic deploys, managed SSL
**Cons**: Free tier sleeps after inactivity
**Cost**: Free tier, then $7/month

### Option 3: Heroku

[Heroku](https://heroku.com/) is a classic PaaS option.

```bash
# Install Heroku CLI
npm install -g heroku

# Login and create app
heroku login
heroku create your-app-name

# Set environment variables
heroku config:set ANTHROPIC_API_KEY=your-key
heroku config:set NODE_ENV=production
heroku config:set REQUIRE_API_KEY=true
heroku config:set API_KEY=your-api-key

# Deploy
git push heroku main
```

**Pros**: Mature platform, easy scaling, add-ons marketplace
**Cons**: No free tier anymore
**Cost**: Starting at $5/month (Eco dynos)

### Option 4: DigitalOcean App Platform

[DigitalOcean App Platform](https://www.digitalocean.com/products/app-platform) offers simple container deployment.

1. Connect GitHub repository
2. Configure as Node.js app
3. Set environment variables
4. Deploy

**Pros**: Predictable pricing, good performance
**Cons**: Fewer integrations than AWS
**Cost**: Starting at $5/month

### Option 5: AWS (For Scale)

For production workloads requiring scale and control.

#### AWS Elastic Beanstalk

```bash
# Install EB CLI
pip install awsebcli

# Initialize and deploy
eb init
eb create production-env
eb setenv ANTHROPIC_API_KEY=your-key NODE_ENV=production
```

#### AWS Lambda + API Gateway

Use serverless for pay-per-request pricing:

1. Package app with serverless-http
2. Deploy via Serverless Framework or SAM
3. Configure API Gateway

**Pros**: Infinite scale, pay-per-use, enterprise features
**Cons**: Complex setup, potential cold starts
**Cost**: Pay-per-use, ~$0.20 per 1M requests + compute

### Option 6: Google Cloud Run

[Cloud Run](https://cloud.google.com/run) offers serverless container hosting.

```bash
# Build and deploy
gcloud run deploy emotions-api \
  --source . \
  --set-env-vars ANTHROPIC_API_KEY=your-key,NODE_ENV=production
```

**Pros**: Serverless, scales to zero, generous free tier
**Cons**: Cold starts, Google Cloud learning curve
**Cost**: Free tier, then pay-per-use

### Option 7: VPS (Full Control)

For maximum control, deploy to a VPS provider:

- [DigitalOcean Droplets](https://www.digitalocean.com/products/droplets) - $4/month
- [Linode](https://www.linode.com/) - $5/month
- [Vultr](https://www.vultr.com/) - $5/month
- [Hetzner](https://www.hetzner.com/) - $4/month (EU)

```bash
# On your VPS
git clone your-repo
cd your-repo
npm install
npm install -g pm2

# Start with PM2 process manager
pm2 start src/server.js --name emotions-api
pm2 save
pm2 startup
```

**Pros**: Full control, best price/performance, no vendor lock-in
**Cons**: You manage everything (updates, security, backups)
**Cost**: $4-20/month depending on specs

### Option 8: Docker (Any Platform)

Create a `Dockerfile`:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "src/server.js"]
```

Deploy to any Docker-compatible platform:
- Docker Compose (local/VPS)
- Kubernetes
- AWS ECS/Fargate
- Google Kubernetes Engine
- Azure Container Instances

### Hosting Comparison

| Platform | Free Tier | Min Cost | SSL | Scale | Complexity |
|----------|-----------|----------|-----|-------|------------|
| Railway | Yes | $5/mo | Auto | Good | Low |
| Render | Yes | $7/mo | Auto | Good | Low |
| Heroku | No | $5/mo | Auto | Good | Low |
| DO App Platform | No | $5/mo | Auto | Good | Low |
| AWS Beanstalk | No | ~$15/mo | Config | Excellent | Medium |
| Cloud Run | Yes | Pay/use | Auto | Excellent | Medium |
| VPS | No | $4/mo | Manual | Manual | High |

### Production Checklist

Before deploying to production:

- [ ] Set `NODE_ENV=production`
- [ ] Set `REQUIRE_API_KEY=true` with a strong `API_KEY`
- [ ] Set `CORS_ORIGIN` to your specific domain(s)
- [ ] Set `HARD_MAX_TOKENS` to control costs
- [ ] Set `CLAUDE_API_RATE_LIMIT_MAX` appropriately
- [ ] Set `LOG_FORMAT=combined` for full logging
- [ ] Configure your reverse proxy/load balancer
- [ ] Set up monitoring and alerting
- [ ] Enable HTTPS (usually automatic with PaaS)
- [ ] Test health endpoints with your orchestrator

## Project Structure

```
nodejs-claude-ai-API-template/
├── src/
│   ├── config/
│   │   └── index.js          # Environment configuration & validation
│   ├── middleware/
│   │   ├── errorHandler.js   # Error handling, async wrapper
│   │   ├── security.js       # API key auth, sanitization, request ID
│   │   └── validation.js     # Input validation rules
│   ├── routes/
│   │   ├── affirmations.js   # Positive/negative affirmation endpoints
│   │   ├── emotions.js       # Emotion support, analysis, quotes
│   │   └── health.js         # Health checks, monitoring, API info
│   ├── services/
│   │   └── claudeService.js  # Claude API with retry & circuit breaker
│   └── server.js             # Express app entry point
├── .env.example              # Example environment variables
├── .gitignore                # Git ignore rules
├── package.json              # Dependencies and scripts
└── README.md                 # This file
```

## Extending the Template

### Adding a New Endpoint

1. Create or modify a route file in `src/routes/`
2. Add validation rules if needed in `src/middleware/validation.js`
3. Use the `claudeService` for AI interactions
4. Wrap async handlers with `asyncHandler`
5. Mount the route in `src/server.js`

### Adding a New System Prompt

System prompts define Claude's behavior. Add them to your route file:

```javascript
const SYSTEM_PROMPTS = {
  myNewPrompt: `You are a helpful assistant that...`,
};

// Use it in your route handler
const response = await promptWithSystem(
  SYSTEM_PROMPTS.myNewPrompt,
  userPrompt,
  { model, maxTokens, temperature }
);
```

### Adding a New Model

Add the model ID to the whitelist in `src/config/index.js`:

```javascript
validModels: [
  'claude-opus-4-5-20251101',
  'claude-sonnet-4-20250514',
  // Add your new model here
  'new-model-id',
],
```

## Troubleshooting

### "API key is not configured"

Ensure `ANTHROPIC_API_KEY` is set in your `.env` file and the file is in your project root.

### "Invalid API key" errors

1. Check your key at [console.anthropic.com](https://console.anthropic.com/)
2. Ensure there are no extra spaces or quotes around the key
3. Verify the key has not been revoked

### Rate limit errors

- Check `/api/stats` to see current usage
- Increase `CLAUDE_API_RATE_LIMIT_MAX` if needed
- Consider using a faster model for high-volume use cases

### Circuit breaker open

The circuit breaker opens after 5 consecutive failures. Check:
1. Your Anthropic API key is valid
2. You have sufficient API credits
3. The Anthropic API status at [status.anthropic.com](https://status.anthropic.com/)

Reset manually (development only):
```bash
curl -X POST http://localhost:3000/api/stats/reset
```

### High costs

1. Lower `HARD_MAX_TOKENS` to limit response length
2. Lower `DEFAULT_MAX_TOKENS` for shorter default responses
3. Switch to `claude-3-5-haiku-20241022` (cheapest model)
4. Lower `CLAUDE_API_RATE_LIMIT_MAX` to limit requests

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
