# SUBJ-Viz: builds the frontend, compiles pySUBJ with the patches applied and serves both.
# Run `git submodule update --init` before building, the SUBJ sources must be in the context.

FROM node:22-bookworm-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# SUBJ is tested on Ubuntu
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates cmake g++ git libeigen3-dev make python3 python3-dev python3-venv \
    && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH
WORKDIR /app
COPY third_party/SUBJ third_party/SUBJ
COPY patches patches
COPY scripts scripts
RUN PYTHON=python scripts/build_pysubj.sh
COPY backend backend
RUN pip install --no-cache-dir ./backend
COPY --from=frontend /app/frontend/dist frontend/dist

ENV SUBJVIZ_STATIC_DIR=/app/frontend/dist \
    SUBJVIZ_PATCH_DIR=/app/patches/subj
EXPOSE 8000
CMD ["python", "-m", "subjviz", "--host", "0.0.0.0", "--port", "8000"]
