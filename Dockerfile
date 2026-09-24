FROM node:24-bookworm-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm install --frozen-lockfile
COPY . .
# Runs the dev server on purpose: vinext 1.0.0-beta.5 production builds drop
# navigateClientSide from the client bundle, so every <Link> click throws.
# Switch to `pnpm build` + `pnpm start` once vinext ships a fix.
#
# Secrets stay out of the image; mount .env at run time. Vite rejects unknown
# Host headers, so pass your public domain:
#   docker build -t makersmap .
#   docker run -d -p 3333:3333 -v "$PWD/.env:/app/.env:ro" \
#     -e __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=example.com makersmap
EXPOSE 3333
CMD ["node", "node_modules/vinext/dist/cli.js", "dev", "--port", "3333", "--hostname", "0.0.0.0"]
