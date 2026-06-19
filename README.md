# ai-detector

Flags r/selfhosted megathread submissions that may contain undisclosed AI-generated code, for moderator review.

## Review service

This repository contains a stateless Fastify service that accepts one Git repository URL, reviews a sampled clone with OpenRouter, and returns a structured JSON assessment for Windmill.

### Setup

```bash
npm install
cp .env.example .env
```

Required environment variables:

- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL` (recommended starting point: `anthropic/claude-sonnet-4.5`)
- `REVIEW_SERVICE_TOKEN`

Optional OpenRouter tuning variables:

- `OPENROUTER_TEMPERATURE` (default: `0.1`; use `0` for the most consistent moderator-review output)
- `OPENROUTER_MAX_TOKENS` (default: `1500`)

For Docker Compose, put these values in `.env`; `docker-compose.yml` loads them through `env_file` instead of listing secrets directly in the `environment` block:

```dotenv
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=anthropic/claude-sonnet-4.5
OPENROUTER_TEMPERATURE=0
OPENROUTER_MAX_TOKENS=1500
REVIEW_SERVICE_TOKEN=...
```

### Run

```bash
npm run dev
```

The service listens on `PORT` or `8080` by default.

With Docker Compose:

```bash
docker compose up --build
```

### Endpoints

- `GET /healthz`
- `POST /review`

Example:

```bash
curl -X POST http://localhost:8080/review \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $REVIEW_SERVICE_TOKEN" \
  -d '{
    "repo_url": "https://github.com/user/project",
    "comment_id": "abc123",
    "comment_permalink": "https://reddit.com/r/selfhosted/comments/xxxx/abc123/",
    "comment_body": "Reddit comment text, including any AI/no-AI disclosure claims.",
    "comment_claimed_no_ai": false,
    "author": "some_user"
  }'
```

Completed reviews are returned in the HTTP response and logged as structured container output. The service does not send Discord messages directly; Windmill owns Discord/moderator routing.

The response separates likely AI involvement from undisclosed-risk:

- `confidence`: risk that AI-generated code is undisclosed
- `ai_assistance_likelihood`: likelihood that AI assistance was used at all
- `disclosed_ai_use` and `disclosure_evidence`: whether the repo or comment disclosed AI use
- `risk_level` and `review_recommendation`: moderator-facing triage fields
- `sample_summary` and `limitations`: sampling coverage and caveats
- `discord_summary`: a moderator-facing summary capped under Discord's 2000-character webhook `content` limit

## Windmill workflow

Use Windmill to poll the r/selfhosted megathread, deduplicate comments, extract repository URLs, call `/review`, and route qualifying review results to Discord or moderator destinations. For Discord webhook posts, use the service's `discord_summary` field as the message `content`; keep the full JSON response in Windmill logs/history for calibration.

A copy-pasteable Windmill script is maintained at `windmill-scripts/r-selfhosted-ai-detector.ts`.
