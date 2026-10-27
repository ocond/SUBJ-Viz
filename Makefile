PYTHON ?= python3
VENV ?= .venv
PY := $(abspath $(VENV))/bin/python

.PHONY: setup pysubj backend frontend build run dev-backend dev-frontend test docker

## setup: create the virtual environment, build pySUBJ and install all dependencies
setup: pysubj backend frontend

$(PY):
	$(PYTHON) -m venv $(VENV)
	$(PY) -m pip install --upgrade pip

## pysubj: build and install pySUBJ from the submodule with the patches applied
pysubj: $(PY)
	git submodule update --init third_party/SUBJ
	PYTHON=$(PY) scripts/build_pysubj.sh

backend: $(PY)
	$(PY) -m pip install -e "backend[test]"

frontend:
	cd frontend && npm ci

## build: build the frontend into frontend/dist (served by the backend)
build:
	cd frontend && npm run build

## run: build the frontend and serve everything on http://127.0.0.1:8000
run: build
	$(PY) -m subjviz

## dev-backend / dev-frontend: API with auto-reload and Vite dev server on :5173
dev-backend:
	$(PY) -m subjviz --reload

dev-frontend:
	cd frontend && npm run dev

test:
	cd backend && $(PY) -m pytest
	cd frontend && npm run typecheck && npm test

docker:
	docker build -t subj-viz .
