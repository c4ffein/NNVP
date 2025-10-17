.PHONY: help test test-e2e test-unit run-docker install dev

# Default target - show help
help:
	@echo "NNVP - Neural Network Visual Programming"
	@echo ""
	@echo "Available commands:"
	@echo "  make help        - Show this help message"
	@echo "  make install     - Install dependencies"
	@echo "  make dev         - Start development server"
	@echo "  make test        - Run all tests (unit + e2e)"
	@echo "  make test-e2e    - Run end-to-end tests with Playwright"
	@echo "  make test-unit   - Run unit tests"
	@echo "  make run-docker  - Run the application using Docker Compose"

# Install dependencies
install:
	cd nnvp-client-vue && npm install

# Start development server
dev:
	cd nnvp-client-vue && npm run dev

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
