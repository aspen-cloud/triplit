FROM oven/bun:1 AS base

WORKDIR /app

COPY package.json ./

RUN bun install

COPY . .

EXPOSE 8080

ENTRYPOINT [ "bun", "run", "index.ts" ]