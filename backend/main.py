from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api import interview
from config import settings
from database import Base, engine

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION
)

# Create tables at startup (beginner-safe)
Base.metadata.create_all(bind=engine)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(interview.router, prefix="/api", tags=["interview"])
from api import tts
app.include_router(tts.router, prefix="/api", tags=["tts"])

@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": settings.PROJECT_NAME,
        "provider": settings.LLM_PROVIDER
    }
