.PHONY: help test test-e2e test-unit run-docker install dev front-lint front-lint-fix

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
	@echo "  make test-e2e        - Run end-to-end tests with Playwright"
	@echo "  make test-unit       - Run unit tests"
	@echo "  make front-lint      - Run oxlint on front-end code"
	@echo "  make front-lint-fix  - Run oxlint and auto-fix issues"
	@echo "  make run-docker      - Run the application using Docker Compose"

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

# Run end-to-end tests
test-e2e:
	cd nnvp-client-vue && npm run test:e2e

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
