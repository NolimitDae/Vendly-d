# Vendly — Claude Code Reference

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | NestJS + Prisma 7 + PostgreSQL (via `@prisma/adapter-pg`) |
| Web Frontend | Next.js 14 App Router + Tailwind CSS |
| Mobile | Expo SDK 54 + React Native + NativeWind |
| Hosting | Railway (backend Docker, frontend/mobile separate) |
| Payments | Stripe (subscriptions + Connect Express for vendor payouts) |
| Realtime | Socket.IO (NestJS gateway ↔ Next.js `useSocket` hook) |

## Folder Structure

```
Vendly-d/
├── Back-end/          NestJS API (port 4000)
│   ├── src/
│   │   ├── modules/   Feature modules (auth, booking, chat, marketplace, …)
│   │   ├── prisma/    PrismaService (uses PrismaPg adapter)
│   │   ├── config/    app.config.ts, JWT config
│   │   └── main.ts
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── generated/   Prisma 7 client output (gitignored)
│   │   └── migrations/
│   ├── prisma.config.ts  Prisma 7 config (datasource URL lives here)
│   └── Dockerfile
├── Front-End/         Next.js web app
│   ├── app/
│   │   ├── (Frond-End)/  Customer/vendor UI (marketplace, chat, wallet, …)
│   │   └── (admin)/      Admin dashboard
│   ├── service/       Axios service wrappers per feature
│   └── hooks/         React hooks (useSocket, useUser, useNotifications, …)
└── Mobile/            Expo React Native app
    ├── App.tsx
    └── src/
        ├── screens/   customer/, vendor/, eventplanner/
        ├── services/  API service wrappers
        ├── navigation/
        └── hooks/
```

## Running Locally

### Backend
```bash
cd Back-end
cp .env.example .env          # set DATABASE_URL, JWT_SECRET, STRIPE_*, etc.
yarn install
npx prisma migrate dev        # applies migrations + regenerates client
yarn start:dev                # runs on http://localhost:4000
```

### Web Frontend
```bash
cd Front-End
cp .env.example .env.local    # set NEXT_PUBLIC_API_URL, etc.
yarn install
yarn dev                      # runs on http://localhost:3000
```

### Mobile
```bash
cd Mobile
npm install
npx expo start                # scan QR with Expo Go or run on simulator
```

## Key Conventions

- **Prisma 7**: datasource URL lives in `prisma.config.ts`, not `schema.prisma`. Client generates to `prisma/generated/`, not `node_modules/.prisma/`.
- **Imports**: backend imports from `prisma/generated/client` (enums, types). Adjust paths if regenerating.
- **Docker CMD**: `nest build` outputs to `dist/src/main.js` (prisma/generated files shift rootDir). Dockerfile uses `node dist/src/main`.
- **Auth**: JWT Bearer tokens; guards in `src/modules/auth/guards/`. User ID extracted from token payload as `req.user.sub`.
- **Stripe API version**: `2025-03-31.basil`. `Invoice.subscription` is gone — access via `invoice.parent?.subscription_details?.subscription`.
- **Branch**: all changes go to `main`.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
