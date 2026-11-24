from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "TradeMatrix"
    VERSION: str = "2.0.0"
    API_V1_STR: str = "/api/v1"

    # Environment & Database
    DATABASE_URL: str = Field(
        default="sqlite:///./tradematrix.db",
        description="Database connection string (SQLite fallback for dev, Postgres for prod)"
    )

    # CORS
    FRONTEND_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ]

    # Workload limits
    MAX_ROWS: int = 15000
    MAX_GRID_CELLS: int = 400
    MAX_WALK_FORWARD_FOLDS: int = 10
    MAX_UPLOAD_MB: int = 10
    REQUEST_TIMEOUT_SECONDS: int = 60

    # Annualization constants
    ANNUALIZATION_FACTORS: dict[str, int] = {
        "1d": 252,
        "daily": 252,
        "1wk": 52,
        "weekly": 52,
        "1mo": 12,
        "monthly": 12,
    }
    DEFAULT_ANNUAL_RISK_FREE_RATE: float = 0.0

    # Cache and Bundled Data Paths
    BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent
    CACHE_DIR: Path = BASE_DIR / "data" / "cache"
    BUNDLED_DIR: Path = BASE_DIR / "data" / "bundled"
    CACHE_TTL_HOURS: int = 24

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
