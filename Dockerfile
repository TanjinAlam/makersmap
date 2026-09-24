FROM node:24-bookworm-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY patches ./patches
RUN COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
# Serves the production build on workerd (the same runtime as Cloudflare Workers).
# Secrets stay out of the image and the built config; mount .env at run time:
#   docker build -t makersmap .
#   docker run -d -p 3333:3333 -v "$PWD/.env:/app/.env:ro" makersmap
EXPOSE 3333
CMD ["node", "--import", "./scripts/sites-env.mjs", "node_modules/wrangler/bin/wrangler.js", "dev", "--config", "dist/server/wrangler.json", "--local", "--ip", "0.0.0.0", "--port", "3333", "--inspector-port", "0", "--env-file", "/app/.env"]
