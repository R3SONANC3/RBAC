# RBAC

A NestJS + Prisma + PostgreSQL backend with role-based access control, and a React + Vite admin frontend for managing users, roles, and permissions.

## Prerequisites

- Docker (for PostgreSQL, or the full containerized stack)
- Node.js, if running the backend/frontend directly on the host

## Getting started (host-run backend/frontend, containerized database)

```bash
docker compose up -d postgres

cd backend
npx prisma migrate deploy
npx prisma db seed
npm run start:dev   # http://localhost:3000

cd ../frontend
npm run dev          # http://localhost:5173
```

Log in at `http://localhost:5173` with the seeded admin account:

- Email: `admin@example.com`
- Password: `Admin123!`

## Alternative: fully containerized stack

```bash
docker compose up --build
docker compose exec api npx prisma migrate deploy
docker compose exec api npx prisma db seed
```

This runs Postgres, the API, and the frontend dev server all in containers (ports 5432, 3000, and 5173 respectively).
