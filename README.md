
# Lancement du projet :
## Pré-requis :
- Installer docker
- Installer docker-compose

## Instructions :
Depuis le répertoire du projet, exécuter le script launch_docker.sh

# Lancement des tests :
- Depuis le répertoire src/pvnn-client-vue :
  - exécuter npm install puis npm run server
  - dans un autre terminal, toujours dans le même répertoire lancer npm run test:e2e
  - attention, pour utiliser un autre navigateur modifier la cible test:e2e du fichier package.json en remplacant firefox par un navigateur installé sur votre machine