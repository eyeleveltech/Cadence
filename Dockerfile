# Next.js standalone build for the app container.
FROM node:22-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Uploads land here, outside the web root, and are served by
# /api/media after an access check. It has to exist and be writable by
# the unprivileged user the server actually runs as — `public` is copied
# root-owned above, which is why uploads used to fail with EACCES once
# the container dropped privileges. Mount a volume over this path
# (see docker-compose.prod.yml) or the library dies with the container.
ENV MEDIA_ROOT=/app/var/media
RUN mkdir -p /app/var/media && chown -R nextjs:nodejs /app/var

USER nextjs
EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]
