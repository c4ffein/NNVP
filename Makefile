.PHONY: help test test-e2e test-unit run-docker install dev front-lint front-lint-fix generate-layers generate-layer-docs

# Default target - show help
help:
	@echo "NNVP - Neural Network Visual Programming"
	@echo ""
	@echo "Available commands:"
	@echo "  make help            - Show this help message"
	@echo "  make install         - Install dependencies"
	@echo "  make dev             - Start development server"
	@echo "  make dev-host        - Start development server, enabling non-localhost connections"
	@echo "  make test            - Run all tests (unit + e2e)"
	@echo "  make test-e2e        - Run end-to-end tests with Playwright, auto set workers number"
	@echo "  make test-e2e-debug  - Run end-to-end tests with Playwright, 1 worker"
	@echo "  make test-e2e-fast   - Run end-to-end tests with Playwright, 4 workers"
	@echo "  make test-unit       - Run unit tests"
	@echo "  make front-lint      - Run oxlint on front-end code"
	@echo "  make front-lint-fix  - Run oxlint and auto-fix issues"
	@echo "  make run-docker      - Run the application using Docker Compose"
	@echo ""
	@echo "Scripts:"
	@echo "  make generate-layers          - Regenerate Keras layers JSON from Python introspection"
	@echo "  make generate-layer-docs LAYER=Dense - Generate HTML documentation for a layer (uses AI)"

# Install dependencies
install:
	cd nnvp-client-vue && npm install

# Start development server
dev:
	cd nnvp-client-vue && npm run dev

# Start development server, enabling the non-localhost connections
dev-host:
	cd nnvp-client-vue && npm run dev -- --host

# Run all tests
test: test-e2e

# Run end-to-end tests with default workers (adapts itself)
test-e2e:
	cd nnvp-client-vue && npm run test:e2e

# Run end-to-end tests with 1 worker
test-e2e-debug:
	cd nnvp-client-vue && npm run test:e2e:debug

# Run end-to-end tests with 4 workers
test-e2e-fast:
	cd nnvp-client-vue && npm run test:e2e:fast

# Run unit tests (if available)
test-unit:
	@echo "Unit tests not yet implemented"

# Run with Docker
run-docker:
	docker-compose up --build

# Run front-end linter
front-lint:
	cd nnvp-client-vue && npm run lint

# Run front-end linter with auto-fix
front-lint-fix:
	cd nnvp-client-vue && npm run lint:fix

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
