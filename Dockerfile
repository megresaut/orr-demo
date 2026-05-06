FROM node:20-bookworm-slim

# Chromium runtime libraries (Puppeteer's bundled Chromium needs these to launch).
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc-s1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libxrender1 \
    libxshmfence1 \
    libxtst6 \
    wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

# Builds the frontend, installs backend deps, and downloads Puppeteer's Chromium.
RUN npm run build

ENV NODE_ENV=production
EXPOSE 8080

CMD ["sh", "-c", "echo '[boot] migrate' && node backend/scripts/migrate.js && (if [ \"$SEED_DEMO\" = \"1\" ]; then echo '[boot] seeding'; node backend/scripts/seed.js; else echo '[boot] skipping seed'; fi) && echo '[boot] starting server' && node backend/server.js"]
