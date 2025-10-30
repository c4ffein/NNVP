# NNVP

**Neural Network Visual Programming** - Generate Python/JS code describing a Keras model by creating a graph representing the different layers in your browser.

🔗 **Demo**: [nnvp.io](https://nnvp.io)

## Quick Start

See the Makefile for all available commands:
```bash
make help
```

Or use these common commands directly:

**Development:**
```bash
make install  # Install dependencies
make dev      # Start development server
```

**Production:**
```bash
cd nnvp-client-vue
npm install
npm run build
# Serve the content of nnvp-client-vue/dist
```

**Testing:**
```bash
make test-e2e  # Run Playwright e2e tests
```

## Documentation

- [Project History](docs/history.md) - Origin story and contributors
- [Tasks & Roadmap](docs/tasks.md) - Current priorities and future features

## License

This project uses the [Inter typeface](https://github.com/rsms/inter) by Rasmus Andersson, licensed under the [SIL Open Font License 1.1](nnvp-client-vue/src/assets/fonts/OFL-LICENSE.txt).

The rest of this project is licensed under the MIT License (see [LICENSE](/LICENSE)).
