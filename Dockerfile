FROM node:24.20.0-alpine3.24

RUN apk add --no-cache git bash less

WORKDIR /app

EXPOSE 3000