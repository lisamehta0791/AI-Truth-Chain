# Backend production image — FastAPI served via uvicorn.
# Build context is expected to be the backend/ directory:
#   docker build -f docker/backend.Dockerfile -t chain-of-truth-backend ./backend
FROM python:3.11-slim

WORKDIR /app

# curl is required by the HEALTHCHECK below. psycopg[binary], bcrypt and the
# other dependencies all ship manylinux wheels, so no compiler or libpq-dev
# is needed — installing build-essential here only bloated the image.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# The source must be copied BEFORE the install: pyproject.toml declares
# `packages = ["app"]`, so running pip against a context with no app/
# directory failed the build outright with
# "Getting requirements to build editable did not run successfully".
# A non-editable install is also the correct choice for an image — `-e`
# only makes sense against a live, mounted working tree.
COPY . .
RUN pip install --no-cache-dir .

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD curl -f http://localhost:8000/health || exit 1

# --workers can be raised for production; kept at 1 here since the demo
# expects a single-process in-memory WebSocket ConnectionManager
# (core/websocket_manager.py) — see docs/ARCHITECTURE.md's deployment notes
# before scaling to multiple workers/replicas.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
