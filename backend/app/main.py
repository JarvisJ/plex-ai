from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from app.routers import agent_router, auth_router, media_router

app = FastAPI(title="Plex API", version="0.1.0")

ALLOWED_ORIGINS = ["http://localhost:5173"]


class CORSMiddleware(BaseHTTPMiddleware):
    """Custom CORS middleware that adds headers to all responses including errors."""

    async def dispatch(self, request: Request, call_next) -> Response:
        origin = request.headers.get("origin", "")

        # Handle preflight requests
        if request.method == "OPTIONS":
            response = Response(status_code=204)
        else:
            try:
                response = await call_next(request)
            except Exception:
                response = JSONResponse(
                    status_code=500,
                    content={"detail": "Internal server error"},
                )

        # Add CORS headers to all responses
        if origin in ALLOWED_ORIGINS or "*" in ALLOWED_ORIGINS:
            response.headers["Access-Control-Allow-Origin"] = origin or "*"
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Allow-Methods"] = "*"
            response.headers["Access-Control-Allow-Headers"] = "*"
            response.headers["Access-Control-Expose-Headers"] = "X-Cache"

        return response


app.add_middleware(CORSMiddleware)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Handle HTTP exceptions with CORS headers."""
    origin = request.headers.get("origin", "")
    headers = {}
    if origin in ALLOWED_ORIGINS:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=headers,
    )

# Include routers
app.include_router(agent_router)
app.include_router(auth_router)
app.include_router(media_router)


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "healthy"}


@app.get("/api/hello")
async def hello() -> dict[str, str]:
    return {"message": "Hello from FastAPI!"}
