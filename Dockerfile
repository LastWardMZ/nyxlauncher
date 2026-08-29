# NyxLauncher — headless core for self-hosted deployment (VPS/NAS via Docker).
# This is an ADDITIONAL deployment option — the Windows desktop installer is
# built and shipped completely separately (electron-builder, see
# electron-builder.yml) and is unaffected by anything here.
#
# Runs src/main/coreIndex.ts — the same business logic as the desktop app
# (server management, the web panel, backups, BlueMap) with zero Electron/
# Chromium involved. See the platform adapter (src/main/platform/) for how
# the same source serves both builds.

FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:core
# The panel's own UI is the same React renderer the desktop app loads —
# remoteServer.ts serves it as static files (RENDERER_DIR = ../renderer
# relative to itself), so it has to exist alongside the compiled core, not
# just the backend. `npm run build` (electron-vite) is what actually
# produces out/renderer/; build:core alone only compiles src/main/**.
RUN npm run build
# out/core/**/*.js still requires its runtime deps from node_modules
# (tsc doesn't bundle) — prune devDependencies before copying to runtime.
RUN npm prune --omit=dev

# Eclipse Temurin's JDK image + Node.js from NodeSource — Minecraft server
# software (Paper/Purpur/vanilla/Forge/NeoForge) all need a real `java` on
# PATH; the launcher itself needs Node to run its own compiled core.
FROM eclipse-temurin:21-jdk-jammy AS runtime
ARG TARGETARCH
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl gnupg tar \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# cloudflared (perfil "Acceso público") — binario Linux baqueado en la
# imagen en tiempo de build, no descargado en cada contenedor de cada
# usuario (ver remoteAccess/cloudflareManager.ts, rama Linux de EXE_PATH).
RUN curl -fsSL -o /usr/local/bin/cloudflared \
      "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${TARGETARCH}" \
    && chmod +x /usr/local/bin/cloudflared

# caddy (dominio propio fuera de Cloudflare) — misma razón que cloudflared.
# La API de descarga de Caddy da el binario en crudo, sin archivo que
# extraer (ver remoteAccess/caddyManager.ts).
RUN curl -fsSL -o /usr/local/bin/caddy \
      "https://caddyserver.com/api/download?os=linux&arch=${TARGETARCH}" \
    && chmod +x /usr/local/bin/caddy

# tailscale — SOLO el binario cliente (tailscale), no tailscaled: en modo
# host el propio host ejecuta el demonio real (ver docker-compose.yml, el
# socket montado) y este contenedor solo consulta su estado; no hace falta
# NET_ADMIN/tun aquí. Versión fija en vez de "stable" para que el build sea
# reproducible.
RUN curl -fsSL -o /tmp/tailscale.tgz \
      "https://pkgs.tailscale.com/stable/tailscale_1.102.3_${TARGETARCH}.tgz" \
    && tar -xzf /tmp/tailscale.tgz -C /tmp \
    && mv /tmp/tailscale_*_${TARGETARCH}/tailscale /usr/local/bin/tailscale \
    && chmod +x /usr/local/bin/tailscale \
    && rm -rf /tmp/tailscale.tgz /tmp/tailscale_*_${TARGETARCH}

WORKDIR /app
COPY --from=build /app/out/core ./out/core
# Lands at out/core/renderer — a sibling of out/core/main, matching
# remoteServer.ts's `join(__dirname, '../renderer')` from wherever its own
# compiled .js ends up (out/core/main/remoteServer.js here).
COPY --from=build /app/out/renderer ./out/core/renderer
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

ENV NYXLAUNCHER_DATA_DIR=/data
ENV NYXLAUNCHER_SERVERS_ROOT=/data/servers
ENV NYXLAUNCHER_PANEL_PORT=8791
ENV NYXLAUNCHER_NETWORK_MODE=host

VOLUME ["/data", "/data/servers"]
EXPOSE 8791

CMD ["node", "out/core/main/coreIndex.js"]
