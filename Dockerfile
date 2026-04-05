FROM node:20-bookworm

RUN apt-get update && apt-get install -y \
    chromium \
    tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && ln -fs /usr/share/zoneinfo/Africa/Lagos /etc/localtime \
    && dpkg-reconfigure -f noninteractive tzdata

WORKDIR /app

COPY package*.json package-lock.json* ./
RUN npm ci --legacy-peer-deps || npm install --legacy-peer-deps

COPY . .

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROME_PATH=/usr/bin/chromium
ENV NODE_OPTIONS="--max-old-space-size=1024"
ENV HOST=0.0.0.0

EXPOSE $PORT

CMD ["node", "server.js"]
