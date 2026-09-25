# Backend image for Railway (the `backend` service). A Dockerfile at the repo
# root makes Railway build from it instead of auto-detecting Node, so the
# system packages the backend needs are explicit and reproducible:
# LibreOffice converts .doc/.docx to PDF at upload time
# (server/documentConverter.ts), which the kiosk needs for the preview, the
# page count and the price before payment. The frontends are built and hosted
# separately (Cloudflare Pages), so none of that happens here.
FROM node:24-bookworm-slim

# LibreOffice Writer without the GUI, plus fonts metric-compatible with the
# ones Word documents usually use (Arial/Times/Courier → Liberation,
# Calibri → Carlito, Cambria → Caladea), so converted pages keep their
# layout and page count. DejaVu covers Cyrillic and Slovak diacritics.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    libreoffice-writer-nogui \
    fonts-liberation2 \
    fonts-crosextra-carlito \
    fonts-crosextra-caladea \
    fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

# /app matches the working directory of the previous auto-detected builds,
# so the volume already mounted under it keeps working.
WORKDIR /app

COPY package.json package-lock.json ./
# Dev dependencies included on purpose: the backend runs TypeScript directly
# through tsx (`npm start`), and tsx is a dev dependency.
RUN npm ci --no-audit --no-fund

COPY . .

ENV NODE_ENV=production
CMD ["npm", "start"]
