# RBAC System — Design Spec

Date: 2026-08-24
Status: Approved for implementation planning

## Purpose

A standalone Role-Based Access Control (RBAC) system: users, roles, and
permissions with a React admin UI and a Node/NestJS API. Independent
of the existing `ci-docker` / `nikorn` (PHP/CodeIgniter) project — no
shared data or code.

## Location

`C:\Users\insys\Desktop\Jeerapat\RBAC` — new, separate git repo.

## Project layout

```
RBAC/
├── backend/     # NestJS + Prisma + PostgreSQL
├── frontend/    # React + Vite + TypeScript + Tailwind + shadcn/ui
└── docker-compose.yml   # postgres, api, web — dev environment
```

Two plain folders, no monorepo tooling (Nx/Turborepo) — unnecessary
for two apps.

## Data model (Prisma / PostgreSQL)

```
User           id, email (unique), passwordHash, isActive, createdAt
Role           id, name (unique), description
Permission     id, resource, action        // unique (resource, action), e.g. "post" + "delete"
UserRole       userId, roleId               // many-to-many join
RolePermission roleId, permissionId         // many-to-many join
RefreshToken   id, userId, tokenHash, expiresAt, revokedAt
AuditLog       id, actorUserId, action, targetType, targetId, meta (json), createdAt
```

- A user can hold multiple roles; a role can hold multiple permissions.
- Permission granularity is `resource:action` (e.g. `post:delete`,
  `role:manage`).
- `RefreshToken.tokenHash` stores a hash, never the raw token.
- `AuditLog` records any change to role/permission assignments
  (who did what, to whom, when).

## Backend (NestJS)

### Auth module
- Register / login issue a JWT access token (~15 min expiry) and a
  refresh token.
- Refresh tokens are persisted (hashed) in `RefreshToken`, rotated on
  every use (old one revoked, new one issued). This lets a token be
  revoked (logout, compromise) without waiting for expiry.
- Passwords hashed with bcrypt.

### Authorization
- `@RequirePermission('resource:action')` decorator + a
  `PermissionsGuard` that loads the requesting user's roles →
  permissions from the DB per request and checks membership.
- No permission cache (Redis or otherwise) for v1 — role/permission
  data changes rarely; a DB read per request is fine at this scale.
  Add caching only if profiling shows it matters.

### Users / Roles / Permissions module
- Standard CRUD endpoints, each guarded by its own permission
  (`user:manage`, `role:manage`, `permission:manage`).
- Endpoints to attach/detach roles on a user and permissions on a
  role.

### Audit
- An interceptor on role/permission-assignment endpoints writes an
  `AuditLog` row automatically (actor, action, target, before/after
  in `meta`). No manual logging calls scattered through the code.

## Frontend (React + Vite + shadcn/ui)

Pages:
- Login
- Dashboard (landing after login)
- Users — list, create/edit, assign roles
- Roles — list, create/edit, assign permissions
- Permissions — list, create/edit
- Audit Log — read-only, filterable list

Built from shadcn/ui `Table`, `Dialog`, `Form` primitives rather than
custom components. Navigation items are hidden per the logged-in
user's permissions, but this is a UX convenience only — the backend
guard is the actual authority.

## Dev environment

Root `docker-compose.yml` with three services: `postgres`, `api`
(NestJS, `--watch`), `web` (Vite dev server). `docker compose up`
brings up the full stack for local development.

## Testing

- Backend: unit tests for `PermissionsGuard` (the highest-risk logic
  in the system) and an e2e test covering the register → login →
  access-a-protected-route → refresh → logout flow.
- No requirement for full endpoint-by-endpoint coverage in v1.

## Out of scope (v1)

- Multi-tenancy / organizations
- SSO / OAuth providers
- Permission caching layer
- Production deployment config (this spec covers dev only)
