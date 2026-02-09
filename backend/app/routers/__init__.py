from app.routers.agent import router as agent_router
from app.routers.auth import router as auth_router
from app.routers.media import router as media_router

__all__ = ["agent_router", "auth_router", "media_router"]
