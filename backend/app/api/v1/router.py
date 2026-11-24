from fastapi import APIRouter

from app.api.v1.backtests import router as backtests_router
from app.api.v1.experiments import router as experiments_router
from app.api.v1.market import router as market_router
from app.api.v1.regimes import router as regimes_router
from app.api.v1.research import router as research_router
from app.api.v1.risk import router as risk_router

api_router = APIRouter()
api_router.include_router(market_router)
api_router.include_router(regimes_router)
api_router.include_router(backtests_router)
api_router.include_router(risk_router)
api_router.include_router(research_router)
api_router.include_router(experiments_router)
