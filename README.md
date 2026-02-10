# Plex Media Browser

A full-stack application for browsing and discovering content in your Plex media library. Features an AI-powered assistant that can search your library, make personalized recommendations, and answer questions about movies and TV shows.

## Features

- **Library Browsing**: View all movies and TV shows in your Plex library with a responsive grid layout
- **Search & Filters**: Client-side search and multiselect filters for genres, years, and content ratings
- **AI Assistant**: Chat with an AI that understands your library and can make recommendations
- **Watchlist Management**: Add and remove items from your Plex watchlist
- **Performance Optimized**: Virtualized grids, lazy-loaded thumbnails, and Redis caching

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    React Frontend                          │  │
│  │  • Vite dev server (port 5173)                            │  │
│  │  • TypeScript + React 19                                   │  │
│  │  • TanStack Query for data fetching                       │  │
│  │  • Virtualized grid with @tanstack/react-virtual          │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ /api/* (proxied)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      FastAPI Backend                             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  • Uvicorn server (port 8000)                             │  │
│  │  • Pydantic v2 for validation                             │  │
│  │  • LangChain + OpenAI for AI agent                        │  │
│  │  • Redis for caching                                       │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │  Plex    │   │  Redis   │   │  OpenAI  │
        │  Server  │   │  Cache   │   │   API    │
        └──────────┘   └──────────┘   └──────────┘
```

## Project Structure

```
plex/
├── frontend/          # React + TypeScript application
│   └── README.md      # Frontend documentation
├── backend/           # FastAPI Python application
│   └── README.md      # Backend documentation
└── CLAUDE.md          # AI assistant context file
```

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.11+
- Redis server
- Plex account with at least one server

### 1. Start Redis

```bash
redis-server
```

### 2. Start the Backend

```bash
cd backend
cp .env.example .env
# Edit .env with your API keys

source .venv/bin/activate
uvicorn app.main:app --reload
```

### 3. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

### 4. Open the App

Navigate to http://localhost:5173 and log in with your Plex account.

## Documentation

- [Frontend README](./frontend/README.md) - React application details
- [Backend README](./backend/README.md) - FastAPI application details
- [CLAUDE.md](./CLAUDE.md) - AI assistant context and patterns

## Environment Variables

### Backend

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key for AI assistant |
| `TAVILY_API_KEY` | Tavily API key for web search |
| `REDIS_URL` | Redis connection URL (default: `redis://localhost:6379`) |
| `SESSION_SECRET_KEY` | Secret key for JWT signing |

## License

Private project - not for distribution.
