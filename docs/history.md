# Project History

## Origin Story
This project was initially carried out as part of my first year of master's degree. The client was forked from Draw.io, which provided a solid user experience foundation.

Continuing this work was proposed as a subject for one of the second year's projects, this time for a bigger team, though with a much shorter development timeline.

Modifying the existing codebase proved challenging, as Draw.io was never designed to run graph algorithms.

## The Rewrite
We decided to rebuild the client from scratch using Vue.js for interface components and D3.js for graph visualization and editing.

We adapted the backend for our new client, which was now simpler since we no longer needed to work with the files saved from our Draw.io fork.

We managed to produce a somewhat usable tool, though it was missing many features and lacked a satisfactory user experience.

## Evolution
Since then, much of the code has been rewritten and refactored, though significant portions still need work.

The backend has been shut down. Thanks to TensorFlow.js, it's now possible to train your first neural networks completely in the browser using your own GPU.

A new closed-source backend may become available in the future, enabling accelerated compute on remote GPUs.

## Contributors

### People who worked on it at the university
- [c4ffein](https://github.com/c4ffein) : Both university projects, most of back-end except the file describing all types of Keras layers. As for the client, interface between the Vue.js and D3.js code, code managing the Keras layers, top bar and left bar components, Docker.
- [Firstein](https://github.com/Firstein) : Most of the D3 codebase.
- [aliuc](https://github.com/aliuc) : Only participated in the first project, wrote the initial file describing Keras layers.
- [leducLouis](https://github.com/leducLouis) : Re-wrote most of this file to specify input and output types, some missing parameter types.
- [nezoutcarl](https://github.com/nezoutcarl) : Right Bar and initial version of most of the Parameter components, e2e tests.
- [elbo](https://github.com/elbo) : D3 functionalities, e2e tests.
- [ChemouneAlaeddine](https://github.com/ChemouneAlaeddine) : D3 functionalities, e2e tests.
