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
└── backend/
    └── app/
        ├── agents/              # LangChain tools (plex.py)
        ├── models/              # Pydantic models
        ├── routers/             # FastAPI route handlers
        └── services/            # Business logic (agent_service, plex_client, cache)
```

## Commands

### Frontend (from `frontend/`)

```bash
npm run dev          # Start dev server (http://localhost:5173)
npm run build        # Production build
npm run lint         # Run ESLint
npm run preview      # Preview production build
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

## Architecture

- **Frontend**: React 19 with TypeScript, built with Vite. Runs on port 5173.
- **Backend**: FastAPI with Pydantic v2 for validation. Runs on port 8000.
- **Vite Proxy**: Frontend proxies `/api/*` requests to backend (configured in `vite.config.ts`), avoiding CORS issues.
- **API prefix**: Backend endpoints use `/api/` prefix for API routes.

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
