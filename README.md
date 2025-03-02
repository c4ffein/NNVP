# WARNING: This is a barely used side project and as I work alone, I'm breaking master for the Vue 3 migration. Check out f78d724032e97852b4f40197bedb9579e59cd1a4 if you want that project in a working state, which is the version in production at [nnvp.io](https://nnvp.io)

# Description
This project allows you to generate Python/JS code describing a Keras model by creating a graph representing the different layers in your browser.
Functionalities to launch the compilation and training on the server could be added if we keep developping it.
A demo is available at [nnvp.io](https://nnvp.io).

# How to run
## Only the standalone client
As we aren't working on an updated backend right now, you can just go to the `nnvp-client-vue` folder:
 - `npm install`
 - `npm run dev` / `npm run dev-host` to run a development version
 - `npm run build` then serve the content of the `nnvp-client-vue/dist` folder.

# Launch the tests - not up to date
- From the src/nnvp-client-vue directory :
  - Execute `npm install` then `npm run serve`
  - In another terminal, still in the same directory, launch `npm run test:e2e`
  - Warning : to use another browser, change test:e2e target of the package.json file, replacing Firefox by another browser installed locally

# Future improvements
- Check [tasks.md](/tasks.md)

# Credits
## History
This project was initially carried out as part of my first year of master's degree. The client was forked from Draw.io, as it provided a really good user experience.
Continuing to work on it was proposed as a subject for one of the the second year's projects, this time for a bigger team, although with a much shorter development time.
Modifying the existing codebase to implement new features was still a really difficult task, as Draw.io was totally not designed to run graph algorithms.
Hence, we decided to re-code the client from scratch, this time using Vue.js for interface components and D3.js for graph visualization and edition.
We only adapted backend for our new client, which was now simpler as we didn't need to work with the files saved from our Draw.io fork.

We managed to produce a somehow usable tool, missing lots of features and without a satisactory user experience.
Since then, a lot of the code has been modified. We still need to refactor big parts of it. You can now generate Keras code without backend, we will focus on client and continue to develop backend only to enable training on it.

## People who worked on it at the university
- [c4ffein](https://github.com/c4ffein) : Both university projects, most of back-end except the file describing all types of Keras layers. As for the client, interface between the Vue.js and D3.js code, code managing the Keras layers, top bar and left bar components, Docker.
- [Firstein](https://github.com/Firstein) : Most of the D3 codebase.
- [aliuc](https://github.com/aliuc) : Only participated in the first project, wrote the initial file describing Keras layers.
- [leducLouis](https://github.com/leducLouis) : Re-wrote most of this file to specify input and output types, some missing parameter types.
- [nezoutcarl](https://github.com/nezoutcarl) : Right Bar and initial version of most of the Parameter components, e2e tests.
- [elbo](https://github.com/elbo) : D3 functionalities, e2e tests.
- [ChemouneAlaeddine](https://github.com/ChemouneAlaeddine) : D3 functionalities, e2e tests.
