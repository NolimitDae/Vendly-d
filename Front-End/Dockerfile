FROM node:20.19.0-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .

# Build args for public env vars (injected at build time)
ARG NEXT_PUBLIC_API_ENDPOINT
ENV NEXT_PUBLIC_API_ENDPOINT=$NEXT_PUBLIC_API_ENDPOINT
# where the /api rewrite forwards to (the API's Railway address, see next.config.ts)
ARG API_PROXY_ORIGIN
ENV API_PROXY_ORIGIN=$API_PROXY_ORIGIN
# Stripe's card form (saved cards) and the media domain for images: without these the build has no
# Stripe key, so cards can't be saved on the website
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_MEDIA_URL
ENV NEXT_PUBLIC_MEDIA_URL=$NEXT_PUBLIC_MEDIA_URL

RUN npm run build

# ---- Production image ----
FROM node:20.19.0-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production
# Docker sets HOSTNAME to the container id; Next's standalone server binds to it unless overridden
ENV HOSTNAME=0.0.0.0

# Leverage Next.js standalone output
COPY --from=builder /usr/src/app/.next/standalone ./
COPY --from=builder /usr/src/app/.next/static ./.next/static
COPY --from=builder /usr/src/app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
