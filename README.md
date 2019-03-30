# Description
This project allows you to generate Python code describing a Keras model by creating a graph representing the different layers in your browser.
Functionalities to launch the compilation and training on the server could be added if we keep developping it.

# How to run
## Prerequisites
- Install docker
- Install docker-compose

## Instructions
From the project directory, execute launch_docker.sh. The server is accessible at port 80 by default.

# Launch the tests
- From the src/pvnn-client-vue directory :
  - Execute npm install then npm run server
  - In another terminal, still in the same directory, launch npm run test:e2e
  - Warning : to use another browser, change test:e2e target of the package.json file, replacing Firefox by another browser installed locally

# Credits
## History
This project was initially carried out as part of my first year of master's degree. The client was forked from Draw.io, as it provided a really good user experience.
Continuing to work on it was proposed as a subject for one of the the second year's projects, this time for a bigger team, although with a much shorter development time.
Modifying the existing codebase to implement new features was still a really difficult task, as Draw.io was totally not designed to run graph algorithms.
Hence, we decided to re-code the client from scratch, this time using Vue.js for interface components and D3.js for graph visualization and edition.
We only adapted backend for our new client, which was now simpler as we didn't need to work with the files saved from our Draw.io fork.

## People who worked on it at the university
- [c4ffein](/c4ffein) : Both university projects, most of back-end except the file describing all types of Keras layers. As for the client, interface between the Vue.js and D3.js code, code managing the Keras layers, top bar and left bar components, Docker.
- [Firstein](/Firstein) : Most of the D3 codebase.
- [aliuc](/aliuc) : Only participated in the first project, wrote the initial file describing Keras layers.
- [leducLouis](/leducLouis) : Re-wrote most of this file to specify input and output types, some missing parameter types.
- [nezoutcarl](/nezoutcarl) : Right Bar and initial version of most of the Parameter components, e2e tests.
- [elbo](/elbo) : D3 functionalities, e2e tests.
- [ChemouneAlaeddine](/ChemouneAlaeddine) : D3 functionalities, e2e tests.
