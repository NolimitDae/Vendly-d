FROM node:20.19.0-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .
RUN npx prisma generate
RUN yarn build

# ---- Production image ----
FROM node:20.19.0-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY package*.json yarn.lock ./
RUN yarn install --frozen-lockfile --production

COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /usr/src/app/prisma ./prisma
COPY --from=builder /usr/src/app/public ./public

EXPOSE 4000

CMD ["node", "dist/main"]
