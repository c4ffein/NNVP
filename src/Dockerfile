FROM node AS builder
ENV CLIENTFOLDER pvnn-client-vue

COPY $CLIENTFOLDER/package.json $CLIENTFOLDER/package-lock.json ./
#COPY $CLIENTFOLDER/package.json ./
RUN npm install && mkdir /app && mv ./node_modules ./package.json ./package-lock.json /app
WORKDIR /app
COPY ./$CLIENTFOLDER/ .
RUN ls .
RUN npm run build

FROM nginx:alpine
RUN rm -rf /var/www/*
COPY --from=builder /app/dist /var/www
