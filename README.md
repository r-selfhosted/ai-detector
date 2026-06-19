# ai-detector

Flags r/selfhosted megathread submissions that may contain undisclosed AI-generated code, for moderator review.

## Review service

This repository contains a stateless Fastify service that accepts one Git repository URL, reviews a sampled clone with OpenRouter, and returns a structured JSON assessment for n8n.

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
    "author": "some_user"
  }'
```

Completed reviews are returned in the HTTP response and logged as structured container output. The service does not send Discord messages directly; n8n owns Discord/moderator routing.

## n8n workflow

Import `workflows/r-selfhosted-ai-detector.n8n.json` into n8n to poll the r/selfhosted megathread and route qualifying review results to Discord.

See `docs/n8n-workflow.md` for required n8n environment variables, import steps, deduplication notes, and the manual test checklist.
