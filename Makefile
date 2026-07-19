.PHONY: help test test-e2e test-e2e-debug test-e2e-fast test-unit test-webgpu run-docker install dev dev-host dev-host-with-backend front-lint front-lint-fix front-typecheck generate-layers generate-layer-docs backend backend-install backend-test test-contract

# The Django backend lives in a sibling checkout; the SPA reaches it at the
# same-origin /api path (vite dev-proxies /api to this server's port).
BACKEND_DIR ?= ../nnvp-backend

# Dev-server runner: npm where it exists (the historical path), bun on the
# node-free box. Install/lint/typecheck/test targets are bun-first — they are
# what CI runs (.github/workflows/ci.yml calls these exact targets), and the
# repo only ships a bun lockfile.
JS_RUN := $(shell command -v npm >/dev/null 2>&1 && echo "npm run" || echo "bun run")
# Playwright must run under the BUN runtime even where node exists (CI
# runners): node's strict ESM resolution rejects the suite's vite-style
# extensionless imports; `bunx --bun` forces bun. (@playwright/test >= 1.58
# no longer needs the old PW_DISABLE_TS_ESM workaround under bun.)
PLAYWRIGHT := bunx --bun playwright test
# Optional: make dev-host PORT=8080
PORT_FLAG = $(if $(PORT),--port $(PORT))

# Default target - show help
help:
	@echo "NNVP - Neural Network Visual Programming"
	@echo ""
	@echo "Available commands:"
	@echo "  make help            - Show this help message"
	@echo "  make install         - Install dependencies"
	@echo "  make dev             - Start development server (PORT=8080 to pick a port)"
	@echo "  make dev-host        - Start development server, enabling non-localhost connections"
	@echo "  make dev-host-with-backend - dev-host + the Django backend on :8000, one Ctrl-C stops both"
	@echo "  make test            - Run all tests (unit + e2e)"
	@echo "  make test-e2e        - Run end-to-end tests with Playwright, auto set workers number"
	@echo "  make test-e2e-debug  - Run end-to-end tests with Playwright, 1 worker"
	@echo "  make test-e2e-fast   - Run end-to-end tests with Playwright, 4 workers"
	@echo "  make test-unit       - Run the dual-mode suite headlessly (bun runner)"
	@echo "  make test-webgpu     - Opt-in: real tinygrad trace pipeline on SwiftShader WebGPU (network + full Chromium)"
	@echo "  make front-lint      - Run oxlint on front-end code"
	@echo "  make front-lint-fix  - Run oxlint and auto-fix issues"
	@echo "  make front-typecheck - Run tsc on front-end code"
	@echo "  make run-docker      - Run the application using Docker Compose"
	@echo ""
	@echo "Backend (sibling checkout, BACKEND_DIR=$(BACKEND_DIR)):"
	@echo "  make backend         - Run the Django backend on :8000 (vite proxies /api to it)"
	@echo "  make backend-install - Build the backend venv (uv) + migrate"
	@echo "  make backend-test    - Run the backend test suite"
	@echo "  make test-contract   - Real-HTTP contract tests: SPA ApiClient vs a throwaway backend"
	@echo ""
	@echo "Scripts:"
	@echo "  make generate-layers          - Regenerate Keras layers JSON from Python introspection"
	@echo "  make generate-layer-docs LAYER=Dense - Generate HTML documentation for a layer (uses AI)"

# Install dependencies (frozen: CI and the box must agree with bun.lock)
install:
	cd nnvp-client-vue && bun install --frozen-lockfile

# Start development server
dev:
	cd nnvp-client-vue && $(JS_RUN) dev -- $(PORT_FLAG)

# Start development server, enabling the non-localhost connections
dev-host:
	cd nnvp-client-vue && $(JS_RUN) dev -- --host $(PORT_FLAG)

# Everything at once: the Django backend on :8000 plus the SPA dev server
# (vite proxies /api to the backend). One Ctrl-C stops both; the first run
# also builds the backend venv and migrates (the backend Makefile's dev does).
# DEBUG_AUTO_ACCEPT_MAIL: magic logins self-verify after ~3s — no mailbox in
# dev (the backend refuses that flag unless DEBUG, so it cannot leak to prod).
dev-host-with-backend:
	@bash -c 'trap "kill 0" EXIT INT TERM; \
	  DEBUG_AUTO_ACCEPT_MAIL=1 $(MAKE) -C $(BACKEND_DIR) dev & \
	  cd nnvp-client-vue && $(JS_RUN) dev -- --host $(PORT_FLAG)'

# Run all tests (the dual suite in both modes: bun runner, then Playwright)
test: test-unit test-e2e

# Run end-to-end tests with default workers (adapts itself)
test-e2e:
	cd nnvp-client-vue && $(PLAYWRIGHT)

# Run end-to-end tests with 1 worker
test-e2e-debug:
	cd nnvp-client-vue && $(PLAYWRIGHT) --workers=1

# Run end-to-end tests with 4 workers
test-e2e-fast:
	cd nnvp-client-vue && $(PLAYWRIGHT) --workers=4

# Run the dual-mode suite headlessly (bun runner; the same tests also run
# in the browser via `make test-e2e`)
test-unit:
	cd nnvp-client-vue && bun run test:fast

# Opt-in: the REAL tinygrad trace pipeline (Pyodide from CDN, real emitted
# runner, SwiftShader WebGPU) — needs network + the full Chromium build
# (`bunx playwright install chromium`). ~2-4 min, dominated by the traces.
test-webgpu:
	cd nnvp-client-vue && NNVP_WEBGPU_E2E=1 $(PLAYWRIGHT) --project=webgpu

# Run with Docker
run-docker:
	docker-compose up --build

# --- Backend (magic-link auth + project storage + assistant proxy) -----------

# Run the backend dev server on :8000; the SPA dev server proxies /api to it.
backend:
	$(MAKE) -C $(BACKEND_DIR) dev

backend-install:
	$(MAKE) -C $(BACKEND_DIR) install migrate

backend-test:
	$(MAKE) -C $(BACKEND_DIR) test

# Real ApiClient against a real throwaway backend (fresh sqlite + file mailbox).
test-contract:
	cd nnvp-client-vue && NNVP_BACKEND_DIR=$(abspath $(BACKEND_DIR)) bash scripts/test-contract.sh

# Run front-end linter
front-lint:
	cd nnvp-client-vue && bun run lint

# Run front-end linter with auto-fix
front-lint-fix:
	cd nnvp-client-vue && bun run lint:fix

# Run the front-end typechecker
front-typecheck:
	cd nnvp-client-vue && bun run typecheck

# Regenerate Keras layers JSON by introspecting the Keras library
generate-layers:
	uv run scripts/generate_keras_layers_json.py 2>/dev/null > nnvp-client-vue/src/lib/KerasInterface/generatedKerasLayers.json

# Generate HTML documentation for a single layer using AI
# Usage: make generate-layer-docs LAYER=Dense
generate-layer-docs:
ifndef LAYER
	$(error LAYER is required. Usage: make generate-layer-docs LAYER=Dense)
endif
	scripts/generate_layer_documentation $(LAYER)
