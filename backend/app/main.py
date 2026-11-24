from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from app.models.experiment import ExperimentModel  # Register all models with Base
from app.api.v1.router import api_router
from app.core.config import settings
from app.core.errors import (
    TradeMatrixException,
    generic_exception_handler,
    tradematrix_exception_handler,
    validation_exception_handler,
)
from app.core.logging import RequestIdMiddleware, logger
from app.database.base import Base
from app.database.session import engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure database tables exist
    logger.info("Initializing TradeMatrix quantitative database...")
    Base.metadata.create_all(bind=engine)
    logger.info(f"Database initialized with engine: {engine.url}")
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Quantitative Market Regime Analysis & Strategy Backtesting Engine",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Request ID & Logging Middleware
app.add_middleware(RequestIdMiddleware)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.FRONTEND_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Exception handlers
app.add_exception_handler(TradeMatrixException, tradematrix_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, generic_exception_handler)


@app.get("/health", tags=["Health"])
def health_check():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "database": "connected",
    }


app.include_router(api_router, prefix=settings.API_V1_STR)
