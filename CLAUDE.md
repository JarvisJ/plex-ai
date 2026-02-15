# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. This file should be continuously updated as the project evolves.

## Project Overview

Plex is a full-stack application for browsing and discovering content in a user's Plex media library. It includes an AI assistant powered by OpenAI that can search the library, make recommendations, and answer questions about movies and TV shows.

## Project Structure

```
plex/
├── frontend/                    # React + TypeScript (Vite)
│   └── src/
│       ├── api/                 # API client functions
│       ├── components/
│       │   ├── agent/           # AI chat panel (AgentPanel, AgentToggle)
│       │   └── media/           # Media display (MediaCard, MediaGrid)
│       ├── contexts/            # React contexts (Auth, Watchlist)
│       ├── hooks/               # Custom hooks (useAgent, useCachedThumbnail)
│       ├── pages/               # Page components
│       └── services/            # Browser services (thumbnailCache with IndexedDB)
├── backend/
│   └── app/
│       ├── agents/              # LangChain tools (plex.py)
│       ├── models/              # Pydantic models
│       ├── routers/             # FastAPI route handlers
│       └── services/            # Business logic (agent_service, plex_client, cache)
├── deploy/                      # Production deployment config
│   ├── docker-compose.prod.yaml # nginx + FastAPI + Redis
│   ├── nginx/nginx.conf         # Reverse proxy with SSE support
│   └── deploy-frontend.sh       # Build & sync frontend to S3
└── infra/                       # Terraform AWS infrastructure
    ├── main.tf                  # Provider, default VPC, AL2023 ARM AMI
    ├── variables.tf             # Region, instance type, secrets
    ├── s3.tf                    # S3 bucket + CloudFront OAC
    ├── cloudfront.tf            # Distribution (S3 + EC2 origins)
    ├── ec2.tf                   # t4g.small, security group, EIP
    ├── iam.tf                   # EC2 role for SSM access
    ├── ssm.tf                   # SecureString params for secrets
    ├── outputs.tf               # CloudFront URL, EC2 IP, bucket name
    └── user-data.sh             # EC2 bootstrap script
```

## Commands

### Frontend (from `frontend/`)

```bash
npm run dev          # Start dev server (http://localhost:5173)
npm run build        # Production build
npm run lint         # Run ESLint
npm run preview      # Preview production build
npx vitest run       # Run all tests
npx vitest run src/components/__tests__/AppLayout.test.tsx  # Run specific test file
```

### Backend (from `backend/`)

```bash
# Activate virtual environment first
source .venv/bin/activate

# Run development server
uvicorn app.main:app --reload    # Starts on http://localhost:8000

# Testing
pytest                           # Run all tests
pytest tests/test_main.py -v     # Run specific test file
pytest -k "test_health"          # Run tests matching pattern

# Linting and type checking
ruff check .                     # Lint
ruff format .                    # Format
mypy app                         # Type check
```

### Dependency Management

Backend uses **uv** for package management:

```bash
uv pip install -e ".[dev]"       # Install all dependencies
uv pip install <package>         # Add new package
```

### Deployment (from project root)

```bash
# Infrastructure (one-time setup + changes)
cd infra && terraform init && terraform apply

# Frontend deploy (build + sync to S3 + invalidate CloudFront)
./deploy/deploy-frontend.sh <s3-bucket> <cloudfront-distribution-id>

# Backend redeploy (SSH into EC2)
ssh ec2-user@<IP> "cd /opt/plex/repo && sudo git pull && cd deploy && sudo docker compose -f docker-compose.prod.yaml up -d --build"
```

## Testing Requirements

**Every code change must include corresponding test updates.** This is a hard rule, not a suggestion.

### When to write tests

- **New component or page**: Create a test file in the nearest `__tests__/` directory (e.g., `components/__tests__/MyComponent.test.tsx`)
- **New hook**: Create a test file in `hooks/__tests__/`
- **New API function**: Create a test file in `api/__tests__/`
- **Modified component/hook/API logic**: Update existing tests to cover the change, and add new test cases for new behavior
- **Bug fix**: Add a regression test that would have caught the bug

### Test conventions

- **Framework**: Vitest + React Testing Library (frontend), pytest (backend)
- **File location**: Tests live in `__tests__/` directories adjacent to source files
- **Mocking pattern**: Use `vi.mock()` with hoisted mocks. Declare mutable mock state (`let mockX = ...`) above `vi.mock()` calls so the factory closures read current values on each render
- **Router wrapping**: Components using React Router must be wrapped in `<MemoryRouter>` with appropriate routes
- **Naming**: Test files match source: `MyComponent.tsx` → `MyComponent.test.tsx`

### Running tests

```bash
# Frontend (from frontend/)
npx vitest run                    # All tests
npx vitest run path/to/test.tsx   # Specific file

# Backend (from backend/)
pytest                            # All tests
pytest tests/test_file.py -v      # Specific file
```

### Verification

After any code change, always run the full test suite (`npx vitest run` or `pytest`) and confirm all tests pass before considering the task complete. Do not leave failing tests.

## Architecture

- **Frontend**: React 19 with TypeScript, built with Vite. Runs on port 5173 locally.
- **Backend**: FastAPI with Pydantic v2 for validation. Runs on port 8000.
- **Vite Proxy**: Frontend proxies `/api/*` requests to backend (configured in `vite.config.ts`), avoiding CORS issues in dev.
- **API prefix**: Backend endpoints use `/api/` prefix for API routes.

### Production Architecture (AWS)

```
Browser -> CloudFront (HTTPS)
             |-- /* -> S3 (frontend static files)
             |-- /api/* -> EC2 (Elastic IP, port 80)
                             |-- nginx (reverse proxy)
                             |-- FastAPI (port 8000, internal)
                             |-- Redis (port 6379, internal)
```

- **CloudFront** unifies both origins under one URL, eliminating CORS issues. Handles SSL termination.
- **S3 + OAC**: Frontend static files served privately through CloudFront Origin Access Control.
- **EC2 (t4g.small ARM)**: Runs Docker Compose with nginx, FastAPI, and Redis.
- **nginx**: Lightweight reverse proxy. Disables buffering for SSE streaming support on `/api/` routes.
- **SSM Parameter Store**: Stores secrets (API keys, session key). EC2 fetches them at boot via IAM role.
- **Terraform** (`infra/`): Manages all infrastructure. State stored locally (no remote backend).
- **No custom domain**: Uses CloudFront's default `*.cloudfront.net` domain.

## Key Features

### AI Agent

- Uses OpenAI (GPT-4o-mini) via LangChain with tool calling
- Tools defined in `backend/app/agents/plex.py` use `PlexClientService` for cached data access
- Streaming responses via Server-Sent Events (SSE)
- Agent filters media items to only return those mentioned in the response text
- Located in `frontend/src/components/agent/` (slide-out panel on right side)

### Caching Layer

- **Backend**: Redis cache via `CacheService` in `backend/app/services/cache.py`
  - User-specific cache keys: `plex:{prefix}:{user_id}:{hash}`
  - Shared cache keys (thumbnails): `plex:{prefix}:shared:{hash}`
  - Full library cached with 1-week TTL for AI tool access
- **Frontend**: IndexedDB cache for thumbnails in `frontend/src/services/thumbnailCache.ts`
  - 7-day expiry, accessed via `useCachedThumbnail` hook

### Media Display

- `MediaGrid`: Virtualized grid using `@tanstack/react-virtual` for performance
- `MediaCard`: Lazy-loads thumbnails using `useIntersectionObserver` hook
- Thumbnails proxied through backend (`/api/media/thumbnail`) with Redis caching

### Streaming API Pattern

The AI chat uses SSE for streaming. The `sendMessageStream` function in `frontend/src/api/agent.ts` must use raw `fetch()` (not `apiFetch`) because streaming requires the raw Response object to read the body stream. The backend streams events with types: `conversation_id`, `tool_call`, `content`, `media_items`, `done`.

## Common Patterns

### FastAPI Body Parameters

Avoid naming Pydantic body parameters `request` in FastAPI endpoints - it causes the framework to expect `{"request": {...}}` wrapper. Use descriptive names like `chat_request`.

### Adding New AI Tools

1. Add tool function with `@tool` decorator in `backend/app/agents/plex.py`
2. Tool should use `_get_cached_items()` helper for cached library access
3. Add tool to the returned list in `create_plex_tools()`

### Environment Variables

Backend requires:

- `OPENAI_API_KEY` - For AI agent
- `TAVILY_API_KEY` - For web search tool
- `REDIS_URL` - For caching (defaults to `redis://localhost:6379`)
- `SESSION_SECRET_KEY` - For JWT signing
- `PLEX_CLIENT_IDENTIFIER` - Plex client identifier
- `FRONTEND_URL` - Frontend URL for CORS (defaults to `http://localhost:5173`, set to CloudFront URL in production)

### CORS Configuration

CORS allowed origins are set in `backend/app/main.py` from `settings.frontend_url` plus `http://localhost:5173`. In production, `FRONTEND_URL` should be the CloudFront URL (e.g., `https://d1234.cloudfront.net`). Since CloudFront unifies both origins under one domain, CORS headers are only needed if the browser makes cross-origin requests (e.g., during local dev).

### Production Docker Compose

The `deploy/docker-compose.prod.yaml` runs 3 services:
- **nginx** (port 80): Reverse proxy to FastAPI, with SSE buffering disabled
- **api**: Builds from `backend/Dockerfile`, reads `.env` for secrets
- **redis**: Persistent volume, healthcheck with `redis-cli ping`

The `.env` file in `deploy/` is generated by EC2 user-data at boot from SSM parameters. It is not checked into git.

### Terraform Infrastructure

All infra is in `infra/`. Key files:
- `terraform.tfvars` (gitignored) contains secrets — copy from `terraform.tfvars.example`
- `user-data.sh` is a templatefile that bootstraps EC2 (installs Docker, clones repo, starts containers)
- CloudFront `/api/*` behavior forwards all headers/cookies with no caching (required for auth + SSE)
- CloudFront SPA routing: custom error responses map 403/404 to `/index.html` with 200
