FROM node:20-bookworm

RUN apt-get update && apt-get install -y \
    chromium \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json package-lock.json* ./
RUN npm ci --legacy-peer-deps || npm install --legacy-peer-deps

COPY . .

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROME_PATH=/usr/bin/chromium
ENV NODE_OPTIONS="--max-old-space-size=1024"
ENV SKIP_INITIAL_FETCH=true
ENV HOST=0.0.0.0

EXPOSE $PORT

CMD ["node", "server.js"]
