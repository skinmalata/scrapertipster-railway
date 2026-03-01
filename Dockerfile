FROM ghcr.io/ultrafunkamsterdam/puppeteer:18.0.5

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
