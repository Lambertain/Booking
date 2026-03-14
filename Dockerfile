FROM node:20-slim

RUN apt-get update && apt-get install -y \
  libnss3 libatk-bridge2.0-0 libdrm2 libxcomposite1 libxdamage1 \
  libxrandr2 libgbm1 libasound2 libpangocairo-1.0-0 libgtk-3-0 \
  libxshmfence1 fonts-liberation ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --production
RUN npx playwright install chromium

COPY . .

CMD ["node", "src/index.js"]
