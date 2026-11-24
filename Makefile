.PHONY: help install test test-backend test-frontend lint run-backend run-frontend docker-up docker-down

help:
	@echo "TradeMatrix Developer Commands"
	@echo "  install         Install backend and frontend dependencies"
	@echo "  test            Run all backend and frontend test suites"
	@echo "  test-backend    Run pytest suite with coverage"
	@echo "  test-frontend   Run vitest suite"
	@echo "  lint            Run ruff, mypy, and type checks"
	@echo "  run-backend     Start FastAPI backend server locally"
	@echo "  run-frontend    Start Vite frontend dev server locally"
	@echo "  docker-up       Build and run full stack via Docker Compose"
	@echo "  docker-down     Stop and tear down Docker Compose services"

install:
	cd backend && pip install -r requirements.txt
	cd frontend && npm install

test: test-backend test-frontend

test-backend:
	cd backend && pytest --cov=app --cov-report=term-missing tests/

test-frontend:
	cd frontend && npm test

lint:
	cd backend && ruff check . && mypy app --explicit-package-bases
	cd frontend && npm run build

run-backend:
	cd backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

run-frontend:
	cd frontend && npm run dev

docker-up:
	docker compose up --build -d

docker-down:
	docker compose down
