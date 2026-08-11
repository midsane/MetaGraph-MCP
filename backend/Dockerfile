FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

RUN npm run build && npm prune --omit=dev

CMD ["node", "dist/src/server/app.js"]
