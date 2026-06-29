# AGENTS.md

## Project Overview
This project is a Node.js/TypeScript review service for r/selfhosted moderators. It exposes a Fastify API that clones submitted repositories, samples tracked files and git metadata, asks OpenRouter for a structured AI-code-risk assessment, and returns JSON plus a Discord-ready summary for a separate Windmill workflow.

## Repository Structure
```text
.
├── src/                    # Fastify service, config, clone/sampling/model review logic
│   ├── index.ts            # Runtime entrypoint
│   ├── server.ts           # /healthz and /review routes
│   ├── reviewer.ts         # Review orchestration and dependency wiring
│   ├── git.ts              # Repository URL validation, normalization, clone, cleanup
│   ├── sampler.ts          # File selection and sample limits for model input
│   ├── metadata.ts         # Git metadata signals
│   ├── model.ts            # OpenRouter request/response handling
│   └── types.ts            # Shared request, response, and dependency types
├── test/                   # Vitest unit and route tests
├── windmill-scripts/       # Copy-pasteable Windmill Reddit polling workflow
├── docs/                   # Reserved for docs; currently empty
├── workflows/              # Reserved for workflow artifacts; currently empty
├── Dockerfile              # Production container build
├── docker-compose.yml      # Local/container service runner
├── biome.json              # Biome lint configuration
├── tsconfig.json           # Strict NodeNext TypeScript build config
└── vitest.config.ts        # Vitest configuration
```

## Environment Setup
1. Use Node.js 20 or newer; the production image uses Node.js 24 Alpine.
2. Install dependencies with `npm install`.
3. Create local configuration with `cp .env.example .env`.
4. Set required environment variables in `.env`: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, and `REVIEW_SERVICE_TOKEN`.
5. Optional tuning variables include `OPENROUTER_TEMPERATURE`, `OPENROUTER_MAX_TOKENS`, `PORT`, `HOST`, `LOG_LEVEL`, clone limits, and sampler limits defined in `src/config.ts`.
6. Ensure `git` is available locally; `/healthz` reports whether the service can run git commands.

## Build & Run
Development:
```bash
npm run dev
```

Production build and start:
```bash
npm run build
npm run start
```

Docker Compose:
```bash
docker compose up --build
```

The service listens on `PORT`, defaulting to `8080`. The public endpoints are `GET /healthz` and authenticated `POST /review`.

## Testing
Tests use Vitest and live in `test/`.
```bash
npm test
```

Run a build check separately:
```bash
npm run build
```

There is no separate integration-test command. Route tests inject Fastify requests, and Windmill helper behavior is covered in `test/windmill-script.test.ts`.

## Code Style & Conventions
- TypeScript is strict, ESM, and configured for `NodeNext`; include `.js` extensions in relative TypeScript imports.
- Keep functions focused and dependency-inject side effects through the existing `Dependencies` shape when testing reviewer behavior.
- Use `npm run build` and `npm test` before handing off changes.
- Run Biome linting with `biome check --config-path biome.json .` when Biome is available globally.
- Biome formatting is intentionally disabled to avoid repo-wide churn; do not reformat unrelated files.
- Main service files use single quotes and semicolons. `windmill-scripts/**/*.ts` intentionally uses double quotes to match Windmill copy-paste expectations.
- Keep API fields in snake_case because they are consumed by Windmill, Discord summaries, and moderator-facing JSON.
- Prefer explicit exported functions for logic that needs tests, especially URL normalization, sampling, model parsing, and summary generation.

## Architecture Notes
- `src/server.ts` owns HTTP concerns only: auth, request validation, logging, status codes, and route wiring.
- `src/reviewer.ts` is the application orchestration layer. It clones, gathers metadata and samples in parallel, calls the model adapter, builds the final response, and always cleans up cloned repositories.
- `src/git.ts`, `src/metadata.ts`, and `src/sampler.ts` encapsulate repository inspection; keep clone limits, cleanup, path filtering, and source/config/documentation categorization there.
- `src/model.ts` is the only OpenRouter integration point. Keep prompt shape, JSON schema expectations, error sanitization, and triage normalization centralized there.
- `src/discord-summary.ts` is the only place that should shape moderator-facing Discord content.
- `windmill-scripts/r-selfhosted-ai-detector.ts` is standalone workflow code for Windmill. Keep it copy-pasteable and avoid coupling it to compiled `src/` modules.
- The Windmill workflow owns Reddit RSS polling, dedupe state, repository URL extraction, confidence thresholding, and Discord delivery. The service should remain stateless.

## Commit & PR Conventions
- No formal commit-message standard is configured. Existing commits use short imperative summaries such as `Normalize repository URLs before cloning`.
- Keep branches and PRs narrowly scoped to one behavior or maintenance slice.
- In PRs, mention the commands run, especially `npm test`, `npm run build`, and any Biome check.
- Do not include secrets, `.env`, sampled private data, or OpenRouter tokens in commits, logs, or PR text.

## Things to Avoid
- Do not bypass bearer-token validation on `POST /review`.
- Do not log `OPENROUTER_API_KEY`, `REVIEW_SERVICE_TOKEN`, authorization headers, or raw secret-bearing errors.
- Do not make the service stateful; dedupe and Discord routing belong in Windmill.
- Do not pass arbitrary Reddit or forge page URLs through unchanged when a cloneable repository root can be normalized.
- Do not treat the model result as definitive proof; preserve probabilistic, human-review language in prompts, responses, and summaries.
- Do not sample lockfiles, build output, dependency directories, or oversized files.
- Do not introduce broad formatting-only changes while Biome formatting remains disabled.
- Do not make the Windmill script depend on repo-local build output or npm packages unavailable in Windmill.
