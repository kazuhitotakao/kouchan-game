FROM node:24.20.0-alpine3.24

RUN apk add --no-cache git

WORKDIR /app

EXPOSE 3000