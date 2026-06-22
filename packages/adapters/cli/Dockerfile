# Kradle agent runtime image (adapters-agent).
#
# Builds @a5c-ai/adapters-cli (ESM, via its own tsc script) self-contained from a
# clean full-repo source context (see Dockerfile.dockerignore — node_modules/.git
# /dist are excluded so the build is deterministic). The previous Dockerfile
# rebuilt with `2>/dev/null; exit 0`, which silently shipped a broken CJS-in-ESM
# dist (a stale GHA cache layer made it stick) and installed no harness CLI — so
# no dispatched agent ever ran.
#
# The runtime uses the kradle entrypoint wrapper, which runs `adapters launch
# <harness> <provider>` through the JS transport-mux proxy and POSTs results to
# the run callback.
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
# Full source context (deps/build artifacts excluded by Dockerfile.dockerignore).
COPY . .
# Clean install of the whole monorepo (matches CI's `npm ci --force`), then build
# the adapters CLI (ESM). Fail loud — a build failure must fail the image.
RUN npm ci --force
RUN npm run build --workspace=@a5c-ai/adapters-cli
RUN node --check packages/adapters/cli/dist/index.js \
 && node --check packages/adapters/cli/kradle-agent-entrypoint.mjs

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# git + ripgrep are commonly required by coding-agent harnesses.
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ripgrep ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# The default kradle harness. createAgentJob maps adapter 'claude-code' → 'claude'.
RUN npm install -g @anthropic-ai/claude-code
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/package.json ./

ENTRYPOINT ["node", "packages/adapters/cli/kradle-agent-entrypoint.mjs"]
