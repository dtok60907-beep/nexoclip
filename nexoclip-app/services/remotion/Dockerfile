# Remotion Studio for local motion-graphics work (NexoClip). Mount src/, public/ and out/
# so edits hot-reload and renders land on the host. Chrome Headless Shell (needed only for
# rendering) downloads on first render; keep it in the remotion-chrome volume (see README).
FROM node:20-bookworm
# Only Chrome Headless Shell's runtime libs and small fonts; Remotion ships its own FFmpeg.
RUN apt-get update && apt-get install -y --no-install-recommends \
      fonts-liberation fonts-noto-color-emoji \
      libnss3 libdbus-1-3 libatk1.0-0 libgbm1 libasound2 libxrandr2 libxkbcommon0 \
      libxfixes3 libxcomposite1 libxdamage1 libatk-bridge2.0-0 libpango-1.0-0 libcairo2 libcups2 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
# Put Remotion's bundled ffmpeg/ffprobe on PATH for scripts/*.sh.
RUN d=$(dirname "$(find node_modules/@remotion -path '*compositor-linux*' -name ffprobe | head -1)") \
    && ln -s "/app/$d/ffmpeg" /usr/local/bin/ffmpeg && ln -s "/app/$d/ffprobe" /usr/local/bin/ffprobe
COPY . .
EXPOSE 3100
CMD ["npx", "remotion", "studio", "src/index.ts", "--port", "3100", "--no-open"]
