FROM node:22-alpine

WORKDIR /app

COPY package.json ./

RUN npm install

COPY . .

EXPOSE 8080

ENV NODE_OPTIONS=""

CMD ["sh", "-c", "node $NODE_OPTIONS ./run.js"]
