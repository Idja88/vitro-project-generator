# syntax=docker/dockerfile:1
#
# Один образ: React собирается в первой стадии, финальный образ — Python 3.12 + gunicorn,
# Flask отдаёт и API, и статику фронтенда. Внешний nginx проксирует /generator на порт 8000.

# --- сборка фронтенда ---
FROM node:26-alpine AS frontend
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# --- приложение ---
FROM python:3.12-slim AS runtime
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /usr/local/bin/uv

ENV PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv

WORKDIR /app

# Сначала только зависимости — этот слой кэшируется, пока не меняется uv.lock
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# Затем сам пакет (non-editable: в образе не нужен исходный каталог)
COPY backend/vitro_generator ./vitro_generator
RUN uv sync --frozen --no-dev --no-editable && rm -rf ./vitro_generator

COPY --from=frontend /src/dist /app/frontend

ENV PATH="/app/.venv/bin:$PATH" \
    FLASK_CONFIG=prod \
    FRONTEND_DIST=/app/frontend

RUN useradd --system --uid 10001 --no-create-home app
USER app

EXPOSE 8000

# /healthz без авторизации; за PrefixMiddleware путь начинается с PREFIX
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:8000' + os.getenv('PREFIX', '') + '/healthz', timeout=4)"

# Создание структуры — десятки последовательных вызовов Vitro-CAD, поэтому длинный таймаут
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "2", "--threads", "4", "--timeout", "300", \
     "--access-logfile", "-", "vitro_generator:create_app()"]
