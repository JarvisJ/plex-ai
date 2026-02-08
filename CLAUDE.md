# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Plex is a full-stack application with a React frontend and FastAPI backend.

## Project Structure

```
plex/
├── frontend/          # React + TypeScript (Vite)
└── backend/           # FastAPI (Python)
    └── app/           # Application code
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
- **CORS**: Backend configured to accept requests from `http://localhost:5173`.
- **API prefix**: Backend endpoints use `/api/` prefix for API routes.
