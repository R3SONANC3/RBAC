# RBAC System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone RBAC system — NestJS/Prisma/PostgreSQL API + React admin UI — with users, multi-role assignment, resource:action permissions, and an audit log of permission changes.

**Architecture:** Two independent apps (`backend/`, `frontend/`) plus a dev `docker-compose.yml`. Backend exposes a REST API guarded by JWT auth + a permission-based authorization guard; frontend is a Vite/React SPA consuming that API. No shared code between them.

**Tech Stack:** NestJS, Prisma, PostgreSQL, `@nestjs/jwt` + `passport-jwt`, bcrypt — React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui, react-router-dom.

**Spec:** [`docs/superpowers/specs/2026-08-24-rbac-system-design.md`](../specs/2026-08-24-rbac-system-design.md)

## Global Constraints

- Project root: `C:\Users\insys\Desktop\Jeerapat\RBAC`, own git repo, no shared code/data with `ci-docker`/`nikorn`.
- No monorepo tooling (Nx/Turborepo) — plain `backend/` and `frontend/` folders.
- No permission-cache layer (Redis or otherwise) in v1 — DB read per request.
- Refresh tokens are stored hashed, never in plaintext, and rotated on every use.
- Out of scope for v1: multi-tenancy, SSO/OAuth, production deploy config.

---

## Task 1: Dev PostgreSQL via docker-compose

**Files:**
- Create: `docker-compose.yml`
- Create: `.env` (root, `POSTGRES_PASSWORD` etc. — gitignored)
- Create: `.gitignore`

**Interfaces:**
- Produces: a Postgres instance reachable at `localhost:5432`, db `rbac`, user `rbac`, password from `.env`, that every later backend task connects to.

- [ ] **Step 1: Write root `.gitignore`**

```
node_modules/
.env
dist/
*.log
```

- [ ] **Step 2: Write root `.env`**

```
POSTGRES_USER=rbac
POSTGRES_PASSWORD=rbac_dev_password
POSTGRES_DB=rbac
```

- [ ] **Step 3: Write `docker-compose.yml` (postgres service only for now)**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

- [ ] **Step 4: Start it and verify**

Run: `docker compose up -d postgres`
Expected: container starts; `docker compose ps` shows `postgres` as `running`/`healthy`.

Run: `docker compose exec postgres psql -U rbac -d rbac -c "select 1;"`
Expected: returns `1`.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml .gitignore
git commit -m "Add dev Postgres via docker-compose"
```

(`.env` is gitignored — not committed.)

---

## Task 2: Backend scaffold + Prisma connection + health check

**Files:**
- Create: `backend/` (via Nest CLI)
- Create: `backend/prisma/schema.prisma` (datasource + generator only, models come in Task 3)
- Create: `backend/.env` (gitignored)
- Create: `backend/src/prisma/prisma.service.ts`
- Create: `backend/src/prisma/prisma.module.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/src/app.controller.ts`
- Test: `backend/test/health.e2e-spec.ts`

**Interfaces:**
- Consumes: Postgres from Task 1 at `localhost:5432/rbac`.
- Produces: `PrismaService` (extends `PrismaClient`, injectable, `onModuleInit` connects) importable by every later backend module via `PrismaModule`. `GET /health` returns `{ status: 'ok' }` once the DB round-trip succeeds.

- [ ] **Step 1: Scaffold Nest app**

Run: `npx @nestjs/cli new backend --package-manager npm --skip-git --language TS`

- [ ] **Step 2: Install Prisma + auth-adjacent deps (auth deps used starting Task 4, install now to avoid repeat installs)**

Run (inside `backend/`):
```bash
npm install @prisma/client bcrypt @nestjs/jwt @nestjs/passport passport passport-jwt @nestjs/config
npm install -D prisma @types/bcrypt @types/passport-jwt
```

- [ ] **Step 3: Init Prisma and point it at the docker-compose Postgres**

Run: `npx prisma init --datasource-provider postgresql`

Edit `backend/.env`:
```
DATABASE_URL="postgresql://rbac:rbac_dev_password@localhost:5432/rbac?schema=public"
JWT_ACCESS_SECRET="dev-access-secret-change-me"
JWT_ACCESS_EXPIRES_IN="15m"
REFRESH_TOKEN_TTL_DAYS="7"
```

- [ ] **Step 4: `PrismaService` + `PrismaModule`**

`backend/src/prisma/prisma.service.ts`:
```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

`backend/src/prisma/prisma.module.ts`:
```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

- [ ] **Step 5: Wire `PrismaModule` + `ConfigModule` into `AppModule`, add `/health`**

`backend/src/app.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
  controllers: [AppController],
})
export class AppModule {}
```

`backend/src/app.controller.ts`:
```typescript
import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}
```

Delete the generated `app.service.ts` and its usages (unused starter boilerplate).

- [ ] **Step 6: Write the e2e test**

`backend/test/health.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns ok once DB round-trip succeeds', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 7: Run it to verify it passes (Postgres from Task 1 must be up)**

Run: `npm run test:e2e`
Expected: `Health (e2e)` suite passes.

- [ ] **Step 8: Commit**

```bash
git add backend
git commit -m "Scaffold NestJS backend with Prisma connection and health check"
```

---

## Task 3: Full Prisma schema, migration, and bootstrap seed

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/seed.ts`
- Modify: `backend/package.json` (add `prisma.seed` config, `ts-node` dev dep)
- Test: `backend/test/schema.e2e-spec.ts`

**Interfaces:**
- Produces: `User`, `Role`, `Permission`, `UserRole`, `RolePermission`, `RefreshToken`, `AuditLog` Prisma models (used by every later backend task) and a seeded admin account (`admin@example.com` / `Admin123!`) with an `admin` role holding `user:manage`, `role:manage`, `permission:manage` — the only way into the system before any UI exists.

- [ ] **Step 1: Write the full schema**

`backend/prisma/schema.prisma` (datasource/generator blocks already present from Task 2 — add these models below them):

```prisma
model User {
  id            String         @id @default(uuid())
  email         String         @unique
  passwordHash  String
  isActive      Boolean        @default(true)
  createdAt     DateTime       @default(now())
  roles         UserRole[]
  refreshTokens RefreshToken[]
  auditLogs     AuditLog[]     @relation("ActorAuditLogs")
}

model Role {
  id          String           @id @default(uuid())
  name        String           @unique
  description String?
  users       UserRole[]
  permissions RolePermission[]
}

model Permission {
  id       String           @id @default(uuid())
  resource String
  action   String
  roles    RolePermission[]

  @@unique([resource, action])
}

model UserRole {
  userId String
  roleId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  role   Role   @relation(fields: [roleId], references: [id], onDelete: Cascade)

  @@id([userId, roleId])
}

model RolePermission {
  roleId       String
  permissionId String
  role         Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission   Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)

  @@id([roleId, permissionId])
}

model RefreshToken {
  id        String    @id @default(uuid())
  userId    String
  tokenHash String
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model AuditLog {
  id          String   @id @default(uuid())
  actorUserId String
  actor       User     @relation("ActorAuditLogs", fields: [actorUserId], references: [id])
  action      String
  targetType  String
  targetId    String
  meta        Json?
  createdAt   DateTime @default(now())
}
```

- [ ] **Step 2: Generate and run the migration**

Run: `npx prisma migrate dev --name init`
Expected: creates `backend/prisma/migrations/<timestamp>_init/`, applies it, regenerates the Prisma client with no errors.

- [ ] **Step 3: Write the seed script**

Run: `npm install -D ts-node`

`backend/prisma/seed.ts`:
```typescript
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const ADMIN_PERMISSIONS = [
  { resource: 'user', action: 'manage' },
  { resource: 'role', action: 'manage' },
  { resource: 'permission', action: 'manage' },
];

async function main() {
  const permissions = await Promise.all(
    ADMIN_PERMISSIONS.map((p) =>
      prisma.permission.upsert({
        where: { resource_action: { resource: p.resource, action: p.action } },
        create: p,
        update: {},
      }),
    ),
  );

  const adminRole = await prisma.role.upsert({
    where: { name: 'admin' },
    create: {
      name: 'admin',
      description: 'Full system access',
      permissions: {
        create: permissions.map((p) => ({ permissionId: p.id })),
      },
    },
    update: {},
  });

  const passwordHash = await bcrypt.hash('Admin123!', 10);
  await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    create: {
      email: 'admin@example.com',
      passwordHash,
      roles: { create: [{ roleId: adminRole.id }] },
    },
    update: {},
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
```

Add to `backend/package.json` (top-level key, alongside `"scripts"`):
```json
"prisma": {
  "seed": "ts-node prisma/seed.ts"
}
```

- [ ] **Step 4: Run the seed**

Run: `npx prisma db seed`
Expected: no errors; re-running it is idempotent (upserts).

- [ ] **Step 5: Write a verification test**

`backend/test/schema.e2e-spec.ts`:
```typescript
import { PrismaClient } from '@prisma/client';

describe('Schema + seed (e2e)', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('seeds an admin user with admin role and the 3 manage permissions', async () => {
    const admin = await prisma.user.findUnique({
      where: { email: 'admin@example.com' },
      include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
    });

    expect(admin).not.toBeNull();
    const roleNames = admin!.roles.map((r) => r.role.name);
    expect(roleNames).toContain('admin');

    const permissionKeys = admin!.roles
      .flatMap((r) => r.role.permissions)
      .map((rp) => `${rp.permission.resource}:${rp.permission.action}`);
    expect(permissionKeys.sort()).toEqual(['permission:manage', 'role:manage', 'user:manage']);
  });
});
```

- [ ] **Step 6: Run it**

Run: `npm run test:e2e -- schema`
Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add backend/prisma backend/package.json backend/package-lock.json backend/test
git commit -m "Add RBAC data model, migration, and admin bootstrap seed"
```

---

## Task 4: Auth module — register, login, refresh, logout

**Files:**
- Create: `backend/src/auth/auth.module.ts`
- Create: `backend/src/auth/auth.controller.ts`
- Create: `backend/src/auth/auth.service.ts`
- Create: `backend/src/auth/dto/register.dto.ts`
- Create: `backend/src/auth/dto/login.dto.ts`
- Create: `backend/src/auth/dto/refresh.dto.ts`
- Create: `backend/src/auth/jwt.strategy.ts`
- Create: `backend/src/auth/jwt-auth.guard.ts`
- Modify: `backend/src/main.ts` (global `ValidationPipe`, CORS)
- Modify: `backend/src/app.module.ts` (import `AuthModule`)
- Test: `backend/test/auth.e2e-spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (Task 2), `User`/`RefreshToken` models (Task 3).
- Produces: `JwtAuthGuard` (used by every guarded controller from Task 6 onward) which sets `request.user = { sub: string, email: string }`. Endpoints: `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`.

- [ ] **Step 1: DTOs**

`backend/src/auth/dto/register.dto.ts`:
```typescript
import { IsEmail, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @MinLength(8)
  password: string;
}
```

`backend/src/auth/dto/login.dto.ts`:
```typescript
import { IsEmail, IsNotEmpty } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsNotEmpty()
  password: string;
}
```

`backend/src/auth/dto/refresh.dto.ts`:
```typescript
import { IsNotEmpty } from 'class-validator';

export class RefreshDto {
  @IsNotEmpty()
  refreshToken: string;
}
```

- [ ] **Step 2: `AuthService` — write the failing test first**

`backend/test/auth.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `test-${Date.now()}@example.com`;
  const password = 'SuperSecret123';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('registers, logs in, refreshes, and logs out', async () => {
    const registerRes = await request(app.getHttpServer()).post('/auth/register').send({ email, password });
    expect(registerRes.status).toBe(201);
    expect(registerRes.body).toMatchObject({ email });

    const loginRes = await request(app.getHttpServer()).post('/auth/login').send({ email, password });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.accessToken).toBeDefined();
    expect(loginRes.body.refreshToken).toBeDefined();

    const refreshRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: loginRes.body.refreshToken });
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.accessToken).toBeDefined();
    expect(refreshRes.body.refreshToken).not.toBe(loginRes.body.refreshToken);

    // old refresh token is now revoked (rotated) — reusing it must fail
    const reuseRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: loginRes.body.refreshToken });
    expect(reuseRes.status).toBe(401);

    const logoutRes = await request(app.getHttpServer())
      .post('/auth/logout')
      .send({ refreshToken: refreshRes.body.refreshToken });
    expect(logoutRes.status).toBe(204);
  });

  it('rejects login with wrong password', async () => {
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'wrong' });
    expect(res.status).toBe(401);
  });
});
```

Run: `npm run test:e2e -- auth`
Expected: FAIL (no `/auth/*` routes exist yet).

- [ ] **Step 3: `AuthService`**

`backend/src/auth/auth.service.ts`:
```typescript
import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(email: string, password: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({ data: { email, passwordHash } });
    return { id: user.id, email: user.email };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.issueTokenPair(user.id, user.email);
  }

  async refresh(rawToken: string) {
    const tokenHash = this.hashToken(rawToken);
    const stored = await this.prisma.refreshToken.findFirst({ where: { tokenHash } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: stored.userId } });
    return this.issueTokenPair(user.id, user.email);
  }

  async logout(rawToken: string) {
    const tokenHash = this.hashToken(rawToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokenPair(userId: string, email: string) {
    const accessToken = this.jwt.sign({ sub: userId, email });

    const rawRefreshToken = crypto.randomBytes(32).toString('hex');
    const ttlDays = Number(this.config.get('REFRESH_TOKEN_TTL_DAYS') ?? 7);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(rawRefreshToken),
        expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
      },
    });

    return { accessToken, refreshToken: rawRefreshToken };
  }

  private hashToken(raw: string) {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }
}
```

- [ ] **Step 4: `AuthController`**

`backend/src/auth/auth.controller.ts`:
```typescript
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto.email, dto.password);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Body() dto: RefreshDto) {
    await this.auth.logout(dto.refreshToken);
  }
}
```

- [ ] **Step 5: `JwtStrategy` + `JwtAuthGuard`**

`backend/src/auth/jwt.strategy.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET')!,
    });
  }

  async validate(payload: { sub: string; email: string }) {
    return payload;
  }
}
```

`backend/src/auth/jwt-auth.guard.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

- [ ] **Step 6: `AuthModule`**

`backend/src/auth/auth.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_ACCESS_EXPIRES_IN') },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
```

- [ ] **Step 7: Wire into `AppModule`, add global `ValidationPipe` + CORS in `main.ts`**

`backend/src/app.module.ts` — add `AuthModule` to `imports`.

`backend/src/main.ts`:
```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.enableCors({ origin: 'http://localhost:5173', credentials: true });
  await app.listen(3000);
}
bootstrap();
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm run test:e2e -- auth`
Expected: PASS (both cases).

- [ ] **Step 9: Commit**

```bash
git add backend/src backend/test
git commit -m "Add auth module: register, login, refresh rotation, logout"
```

---

## Task 5: Permission-based authorization guard

**Files:**
- Create: `backend/src/rbac/require-permission.decorator.ts`
- Create: `backend/src/rbac/permissions.guard.ts`
- Create: `backend/src/rbac/rbac.module.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/test/permissions-guard.e2e-spec.ts`

**Interfaces:**
- Consumes: `JwtAuthGuard`'s `request.user.sub` (Task 4), `UserRole`/`RolePermission` models (Task 3).
- Produces: `@RequirePermission('resource:action')` decorator + `PermissionsGuard`, used by Users/Roles/Permissions controllers (Tasks 6-8) as `@UseGuards(JwtAuthGuard, PermissionsGuard)`.

- [ ] **Step 1: Decorator**

`backend/src/rbac/require-permission.decorator.ts`:
```typescript
import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'permission';
export const RequirePermission = (permission: string) => SetMetadata(PERMISSION_KEY, permission);
```

- [ ] **Step 2: Write the failing test**

`backend/test/permissions-guard.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { PermissionsGuard } from '../src/rbac/permissions.guard';
import { RequirePermission } from '../src/rbac/require-permission.decorator';

@Controller('test-protected')
class TestProtectedController {
  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('user:manage')
  ping() {
    return { ok: true };
  }
}

describe('PermissionsGuard (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;

  beforeAll(async () => {
    // `controllers` here is merged onto the compiled root module, so the
    // throwaway TestProtectedController becomes reachable without touching AppModule.
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestProtectedController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    auth = moduleRef.get(AuthService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('denies access when the user has no matching permission, allows once granted', async () => {
    const email = `guard-${Date.now()}@example.com`;
    await auth.register(email, 'SuperSecret123');
    const { accessToken } = await auth.login(email, 'SuperSecret123');

    const denied = await request(app.getHttpServer())
      .get('/test-protected')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(denied.status).toBe(403);

    // Grant the permission directly via Prisma — re-login isn't needed,
    // the guard re-reads roles/permissions from the DB on every request.
    const permission = await prisma.permission.upsert({
      where: { resource_action: { resource: 'user', action: 'manage' } },
      create: { resource: 'user', action: 'manage' },
      update: {},
    });
    const role = await prisma.role.create({ data: { name: `guard-role-${Date.now()}` } });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });

    const allowed = await request(app.getHttpServer())
      .get('/test-protected')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(allowed.status).toBe(200);
    expect(allowed.body).toEqual({ ok: true });
  });
});
```

Run: `npm run test:e2e -- permissions-guard`
Expected: FAIL (`PermissionsGuard` doesn't exist yet).

- [ ] **Step 3: `PermissionsGuard`**

`backend/src/rbac/permissions.guard.ts`:
```typescript
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { PERMISSION_KEY } from './require-permission.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<string>(PERMISSION_KEY, context.getHandler());
    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request.user?.sub;
    if (!userId) throw new ForbiddenException('Not authenticated');

    const [resource, action] = required.split(':');
    const match = await this.prisma.userRole.findFirst({
      where: {
        userId,
        role: { permissions: { some: { permission: { resource, action } } } },
      },
    });

    if (!match) throw new ForbiddenException(`Missing permission: ${required}`);
    return true;
  }
}
```

- [ ] **Step 4: `RbacModule` (exports the guard so feature modules can inject it)**

`backend/src/rbac/rbac.module.ts`:
```typescript
import { Global, Module } from '@nestjs/common';
import { PermissionsGuard } from './permissions.guard';

@Global()
@Module({
  providers: [PermissionsGuard],
  exports: [PermissionsGuard],
})
export class RbacModule {}
```

Add `RbacModule` to `backend/src/app.module.ts` imports.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:e2e -- permissions-guard`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src backend/test
git commit -m "Add permission-based authorization guard"
```

---

## Task 6: Users module — CRUD + role assignment

**Files:**
- Create: `backend/src/users/users.module.ts`
- Create: `backend/src/users/users.controller.ts`
- Create: `backend/src/users/users.service.ts`
- Create: `backend/src/users/dto/update-user.dto.ts`
- Create: `backend/src/users/dto/assign-role.dto.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/test/users.e2e-spec.ts`

**Interfaces:**
- Consumes: `JwtAuthGuard`, `PermissionsGuard`, `@RequirePermission` (Tasks 4-5); seeded admin (Task 3) as the actor with `user:manage`.
- Produces: `GET/PATCH/DELETE /users`, `POST/DELETE /users/:id/roles/:roleId` — the assign/remove-role endpoints are what Task 9's audit interceptor wraps.

User creation happens only via `POST /auth/register` (Task 4) — this module manages existing users (list, update, deactivate/delete, role assignment), matching the spec's "assign roles" scope without duplicating registration.

- [ ] **Step 1: DTOs**

`backend/src/users/dto/update-user.dto.ts`:
```typescript
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
```

`backend/src/users/dto/assign-role.dto.ts` is not needed — `roleId` comes from the route param (see controller below).

- [ ] **Step 2: Write the failing test**

`backend/test/users.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let targetUserId: string;
  let roleId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    const auth = moduleRef.get(AuthService);

    const { accessToken } = await auth.login('admin@example.com', 'Admin123!');
    adminToken = accessToken;

    const email = `users-target-${Date.now()}@example.com`;
    await auth.register(email, 'SuperSecret123');
    const target = await prisma.user.findUniqueOrThrow({ where: { email } });
    targetUserId = target.id;

    const role = await prisma.role.create({ data: { name: `role-${Date.now()}` } });
    roleId = role.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: targetUserId } });
    await prisma.role.delete({ where: { id: roleId } });
    await app.close();
  });

  it('lists, updates, assigns/removes a role, and deletes a user — all as admin', async () => {
    const list = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.some((u: any) => u.id === targetUserId)).toBe(true);

    const update = await request(app.getHttpServer())
      .patch(`/users/${targetUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });
    expect(update.status).toBe(200);
    expect(update.body.isActive).toBe(false);

    const assign = await request(app.getHttpServer())
      .post(`/users/${targetUserId}/roles/${roleId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(assign.status).toBe(201);

    const withRole = await request(app.getHttpServer())
      .get(`/users/${targetUserId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(withRole.body.roles.map((r: any) => r.id)).toContain(roleId);

    const remove = await request(app.getHttpServer())
      .delete(`/users/${targetUserId}/roles/${roleId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(remove.status).toBe(204);
  });

  it('rejects a non-admin caller with 403', async () => {
    const email = `users-plain-${Date.now()}@example.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email, password: 'SuperSecret123' });
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'SuperSecret123' });

    const res = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(res.status).toBe(403);
  });
});
```

Run: `npm run test:e2e -- users`
Expected: FAIL (no `/users` routes yet).

- [ ] **Step 3: `UsersService`**

`backend/src/users/users.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly withRoles = { roles: { include: { role: true } } };

  async list() {
    const users = await this.prisma.user.findMany({ include: this.withRoles });
    return users.map(this.toDto);
  }

  async get(id: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id }, include: this.withRoles });
    return this.toDto(user);
  }

  async update(id: string, data: { isActive?: boolean }) {
    const user = await this.prisma.user.update({ where: { id }, data, include: this.withRoles });
    return this.toDto(user);
  }

  async delete(id: string) {
    await this.prisma.user.delete({ where: { id } });
  }

  async assignRole(userId: string, roleId: string) {
    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      create: { userId, roleId },
      update: {},
    });
  }

  async removeRole(userId: string, roleId: string) {
    await this.prisma.userRole.deleteMany({ where: { userId, roleId } });
  }

  private toDto(user: { id: string; email: string; isActive: boolean; roles: { role: { id: string; name: string } }[] }) {
    return {
      id: user.id,
      email: user.email,
      isActive: user.isActive,
      roles: user.roles.map((r) => ({ id: r.role.id, name: r.role.name })),
    };
  }
}
```

- [ ] **Step 4: `UsersController`**

`backend/src/users/users.controller.ts`:
```typescript
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('user:manage')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.users.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  delete(@Param('id') id: string) {
    return this.users.delete(id);
  }

  @Post(':id/roles/:roleId')
  @HttpCode(201)
  assignRole(@Param('id') id: string, @Param('roleId') roleId: string) {
    return this.users.assignRole(id, roleId);
  }

  @Delete(':id/roles/:roleId')
  @HttpCode(204)
  removeRole(@Param('id') id: string, @Param('roleId') roleId: string) {
    return this.users.removeRole(id, roleId);
  }
}
```

- [ ] **Step 5: `UsersModule`, wire into `AppModule`**

`backend/src/users/users.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
```

Add `UsersModule` to `backend/src/app.module.ts` imports.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run test:e2e -- users`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src backend/test
git commit -m "Add users module: CRUD and role assignment"
```

---

## Task 7: Roles module — CRUD + permission assignment

**Files:**
- Create: `backend/src/roles/roles.module.ts`
- Create: `backend/src/roles/roles.controller.ts`
- Create: `backend/src/roles/roles.service.ts`
- Create: `backend/src/roles/dto/create-role.dto.ts`
- Create: `backend/src/roles/dto/update-role.dto.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/test/roles.e2e-spec.ts`

**Interfaces:**
- Consumes: `JwtAuthGuard`, `PermissionsGuard` (Tasks 4-5); `role:manage` permission on the seeded admin (Task 3).
- Produces: `GET/POST/PATCH/DELETE /roles`, `POST/DELETE /roles/:id/permissions/:permissionId` — wrapped by Task 9's audit interceptor.

- [ ] **Step 1: DTOs**

`backend/src/roles/dto/create-role.dto.ts`:
```typescript
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateRoleDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}
```

`backend/src/roles/dto/update-role.dto.ts`:
```typescript
import { PartialType } from '@nestjs/mapped-types';
import { CreateRoleDto } from './create-role.dto';

export class UpdateRoleDto extends PartialType(CreateRoleDto) {}
```

Run: `npm install @nestjs/mapped-types`

- [ ] **Step 2: Write the failing test**

`backend/test/roles.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Roles (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let roleId: string;
  let permissionId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    const auth = moduleRef.get(AuthService);
    adminToken = (await auth.login('admin@example.com', 'Admin123!')).accessToken;

    const permission = await prisma.permission.create({
      data: { resource: `res-${Date.now()}`, action: 'read' },
    });
    permissionId = permission.id;
  });

  afterAll(async () => {
    await prisma.permission.delete({ where: { id: permissionId } });
    await app.close();
  });

  it('creates, lists, updates, assigns/removes a permission, and deletes a role', async () => {
    const create = await request(app.getHttpServer())
      .post('/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `editor-${Date.now()}`, description: 'Editor role' });
    expect(create.status).toBe(201);
    roleId = create.body.id;

    const list = await request(app.getHttpServer())
      .get('/roles')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.some((r: any) => r.id === roleId)).toBe(true);

    const update = await request(app.getHttpServer())
      .patch(`/roles/${roleId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ description: 'Updated' });
    expect(update.body.description).toBe('Updated');

    const assign = await request(app.getHttpServer())
      .post(`/roles/${roleId}/permissions/${permissionId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(assign.status).toBe(201);

    const withPermission = await request(app.getHttpServer())
      .get(`/roles/${roleId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(withPermission.body.permissions.map((p: any) => p.id)).toContain(permissionId);

    const remove = await request(app.getHttpServer())
      .delete(`/roles/${roleId}/permissions/${permissionId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(remove.status).toBe(204);

    const del = await request(app.getHttpServer())
      .delete(`/roles/${roleId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(204);
  });
});
```

Run: `npm run test:e2e -- roles`
Expected: FAIL.

- [ ] **Step 3: `RolesService`**

`backend/src/roles/roles.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly withPermissions = { permissions: { include: { permission: true } } };

  create(data: { name: string; description?: string }) {
    return this.prisma.role.create({ data }).then(this.toDto.bind(this, []));
  }

  async list() {
    const roles = await this.prisma.role.findMany({ include: this.withPermissions });
    return roles.map((r) => this.toDtoFull(r));
  }

  async get(id: string) {
    const role = await this.prisma.role.findUniqueOrThrow({ where: { id }, include: this.withPermissions });
    return this.toDtoFull(role);
  }

  async update(id: string, data: { name?: string; description?: string }) {
    const role = await this.prisma.role.update({ where: { id }, data, include: this.withPermissions });
    return this.toDtoFull(role);
  }

  async delete(id: string) {
    await this.prisma.role.delete({ where: { id } });
  }

  async assignPermission(roleId: string, permissionId: string) {
    await this.prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId, permissionId } },
      create: { roleId, permissionId },
      update: {},
    });
  }

  async removePermission(roleId: string, permissionId: string) {
    await this.prisma.rolePermission.deleteMany({ where: { roleId, permissionId } });
  }

  private toDto(permissions: { id: string; resource: string; action: string }[], role: { id: string; name: string; description: string | null }) {
    return { id: role.id, name: role.name, description: role.description, permissions };
  }

  private toDtoFull(role: {
    id: string;
    name: string;
    description: string | null;
    permissions: { permission: { id: string; resource: string; action: string } }[];
  }) {
    return this.toDto(role.permissions.map((rp) => rp.permission), role);
  }
}
```

- [ ] **Step 4: `RolesController`**

`backend/src/roles/roles.controller.ts`:
```typescript
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('role:manage')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Post()
  create(@Body() dto: CreateRoleDto) {
    return this.roles.create(dto);
  }

  @Get()
  list() {
    return this.roles.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.roles.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.roles.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  delete(@Param('id') id: string) {
    return this.roles.delete(id);
  }

  @Post(':id/permissions/:permissionId')
  @HttpCode(201)
  assignPermission(@Param('id') id: string, @Param('permissionId') permissionId: string) {
    return this.roles.assignPermission(id, permissionId);
  }

  @Delete(':id/permissions/:permissionId')
  @HttpCode(204)
  removePermission(@Param('id') id: string, @Param('permissionId') permissionId: string) {
    return this.roles.removePermission(id, permissionId);
  }
}
```

- [ ] **Step 5: `RolesModule`, wire into `AppModule`**

`backend/src/roles/roles.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  controllers: [RolesController],
  providers: [RolesService],
})
export class RolesModule {}
```

Add `RolesModule` to `backend/src/app.module.ts` imports.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run test:e2e -- roles`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src backend/test
git commit -m "Add roles module: CRUD and permission assignment"
```

---

## Task 8: Permissions module — CRUD

**Files:**
- Create: `backend/src/permissions/permissions.module.ts`
- Create: `backend/src/permissions/permissions.controller.ts`
- Create: `backend/src/permissions/permissions.service.ts`
- Create: `backend/src/permissions/dto/create-permission.dto.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/test/permissions.e2e-spec.ts`

**Interfaces:**
- Consumes: `JwtAuthGuard`, `PermissionsGuard` (Tasks 4-5); `permission:manage` on the seeded admin.
- Produces: `GET/POST/DELETE /permissions`, consumed by the frontend Permissions page (Task 15) and referenced by role-assignment (Task 7).

- [ ] **Step 1: DTO**

`backend/src/permissions/dto/create-permission.dto.ts`:
```typescript
import { IsNotEmpty, IsString } from 'class-validator';

export class CreatePermissionDto {
  @IsNotEmpty()
  @IsString()
  resource: string;

  @IsNotEmpty()
  @IsString()
  action: string;
}
```

- [ ] **Step 2: Write the failing test**

`backend/test/permissions.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';

describe('Permissions (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let permissionId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
    const auth = moduleRef.get(AuthService);
    adminToken = (await auth.login('admin@example.com', 'Admin123!')).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates, lists, and deletes a permission', async () => {
    const create = await request(app.getHttpServer())
      .post('/permissions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ resource: `res-${Date.now()}`, action: 'read' });
    expect(create.status).toBe(201);
    permissionId = create.body.id;

    const list = await request(app.getHttpServer())
      .get('/permissions')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.some((p: any) => p.id === permissionId)).toBe(true);

    const del = await request(app.getHttpServer())
      .delete(`/permissions/${permissionId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(204);
  });

  it('rejects a duplicate resource:action pair with 409', async () => {
    const payload = { resource: `dup-${Date.now()}`, action: 'read' };
    const first = await request(app.getHttpServer())
      .post('/permissions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);
    expect(first.status).toBe(201);

    const second = await request(app.getHttpServer())
      .post('/permissions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);
    expect(second.status).toBe(409);
  });
});
```

Run: `npm run test:e2e -- permissions` (not `permissions-guard`)
Expected: FAIL.

- [ ] **Step 3: `PermissionsService`**

`backend/src/permissions/permissions.service.ts`:
```typescript
import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: { resource: string; action: string }) {
    try {
      return await this.prisma.permission.create({ data });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Permission ${data.resource}:${data.action} already exists`);
      }
      throw e;
    }
  }

  list() {
    return this.prisma.permission.findMany();
  }

  async delete(id: string) {
    await this.prisma.permission.delete({ where: { id } });
  }
}
```

- [ ] **Step 4: `PermissionsController`**

`backend/src/permissions/permissions.controller.ts`:
```typescript
import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { PermissionsService } from './permissions.service';
import { CreatePermissionDto } from './dto/create-permission.dto';

@Controller('permissions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('permission:manage')
export class PermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

  @Post()
  create(@Body() dto: CreatePermissionDto) {
    return this.permissions.create(dto);
  }

  @Get()
  list() {
    return this.permissions.list();
  }

  @Delete(':id')
  @HttpCode(204)
  delete(@Param('id') id: string) {
    return this.permissions.delete(id);
  }
}
```

- [ ] **Step 5: `PermissionsModule`, wire into `AppModule`**

`backend/src/permissions/permissions.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';

@Module({
  controllers: [PermissionsController],
  providers: [PermissionsService],
})
export class PermissionsModule {}
```

Add `PermissionsModule` to `backend/src/app.module.ts` imports.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run test:e2e -- "permissions\."`
Expected: PASS (both cases).

- [ ] **Step 7: Commit**

```bash
git add backend/src backend/test
git commit -m "Add permissions module: CRUD"
```

---

## Task 9: Audit log on permission-changing endpoints

**Files:**
- Create: `backend/src/audit/audit.decorator.ts`
- Create: `backend/src/audit/audit.interceptor.ts`
- Create: `backend/src/audit/audit.module.ts`
- Modify: `backend/src/users/users.controller.ts` (add `@Audit` to `assignRole`/`removeRole`)
- Modify: `backend/src/roles/roles.controller.ts` (add `@Audit` to `assignPermission`/`removePermission`)
- Modify: `backend/src/app.module.ts`
- Test: `backend/test/audit.e2e-spec.ts`

**Interfaces:**
- Consumes: `request.user.sub` (set by `JwtAuthGuard`, Task 4), `AuditLog` model (Task 3), the 4 assign/remove endpoints from Tasks 6-7.
- Produces: a row in `AuditLog` per call to one of those 4 endpoints. Scope note: covers role↔user and permission↔role assignment changes (the actual "who can access what" surface) — not generic CRUD create/delete of Role/Permission entities, which is a v2 extension if needed.

- [ ] **Step 1: `@Audit` decorator**

`backend/src/audit/audit.decorator.ts`:
```typescript
import { SetMetadata } from '@nestjs/common';

export const AUDIT_ACTION_KEY = 'auditAction';
export const Audit = (action: string) => SetMetadata(AUDIT_ACTION_KEY, action);
```

- [ ] **Step 2: Write the failing test**

`backend/test/audit.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Audit log (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let adminId: string;
  let roleId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    const auth = moduleRef.get(AuthService);
    adminToken = (await auth.login('admin@example.com', 'Admin123!')).accessToken;
    adminId = (await prisma.user.findUniqueOrThrow({ where: { email: 'admin@example.com' } })).id;

    const role = await prisma.role.create({ data: { name: `audit-role-${Date.now()}` } });
    roleId = role.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { targetId: roleId } });
    await prisma.userRole.deleteMany({ where: { userId: adminId, roleId } });
    await prisma.role.delete({ where: { id: roleId } });
    await app.close();
  });

  it('writes an AuditLog row when a role is assigned to a user', async () => {
    const res = await request(app.getHttpServer())
      .post(`/users/${adminId}/roles/${roleId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(201);

    const logs = await prisma.auditLog.findMany({ where: { targetType: 'UserRole', targetId: roleId } });
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].actorUserId).toBe(adminId);
    expect(logs[0].action).toBe('role:assign');
  });
});
```

Run: `npm run test:e2e -- audit`
Expected: FAIL (no `AuditLog` rows written yet).

- [ ] **Step 3: `AuditInterceptor`**

`backend/src/audit/audit.interceptor.ts`:
```typescript
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../prisma/prisma.service';
import { AUDIT_ACTION_KEY } from './audit.decorator';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const action = this.reflector.get<string>(AUDIT_ACTION_KEY, context.getHandler());
    if (!action) return next.handle();

    const request = context.switchToHttp().getRequest();
    const actorUserId: string = request.user.sub;
    const params = request.params;

    return next.handle().pipe(
      tap(() => {
        const [targetType, targetId] = this.resolveTarget(action, params);
        void this.prisma.auditLog.create({
          data: { actorUserId, action, targetType, targetId, meta: params },
        });
      }),
    );
  }

  private resolveTarget(action: string, params: Record<string, string>): [string, string] {
    if (action.startsWith('role:')) return ['UserRole', params.roleId];
    return ['RolePermission', params.permissionId];
  }
}
```

- [ ] **Step 4: `AuditModule`**

`backend/src/audit/audit.module.ts`:
```typescript
import { Global, Module } from '@nestjs/common';
import { AuditInterceptor } from './audit.interceptor';

@Global()
@Module({
  providers: [AuditInterceptor],
  exports: [AuditInterceptor],
})
export class AuditModule {}
```

Add `AuditModule` to `backend/src/app.module.ts` imports.

- [ ] **Step 5: Apply `@Audit` + `AuditInterceptor` to the 4 mutation endpoints**

In `backend/src/users/users.controller.ts`, update the two role endpoints:
```typescript
  @Post(':id/roles/:roleId')
  @HttpCode(201)
  @UseInterceptors(AuditInterceptor)
  @Audit('role:assign')
  assignRole(@Param('id') id: string, @Param('roleId') roleId: string) {
    return this.users.assignRole(id, roleId);
  }

  @Delete(':id/roles/:roleId')
  @HttpCode(204)
  @UseInterceptors(AuditInterceptor)
  @Audit('role:remove')
  removeRole(@Param('id') id: string, @Param('roleId') roleId: string) {
    return this.users.removeRole(id, roleId);
  }
```
(add `UseInterceptors` to the `@nestjs/common` import, and import `Audit`/`AuditInterceptor`)

In `backend/src/roles/roles.controller.ts`, update the two permission endpoints the same way with `@Audit('permission:assign')` / `@Audit('permission:remove')`.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run test:e2e -- audit`
Expected: PASS.

- [ ] **Step 7: Run the full backend test suite to check nothing broke**

Run: `npm run test:e2e`
Expected: all suites pass.

- [ ] **Step 8: Commit**

```bash
git add backend/src backend/test
git commit -m "Add audit logging on role/permission assignment changes"
```

---

## Task 10: Frontend scaffold — Vite, React, TypeScript, Tailwind, shadcn/ui, routing shell

**Files:**
- Create: `frontend/` (via `npm create vite`)
- Modify: `frontend/tailwind.config.js`, `frontend/src/index.css`
- Create: `frontend/src/routes.tsx`
- Modify: `frontend/src/App.tsx`, `frontend/src/main.tsx`

**Interfaces:**
- Produces: a running Vite dev server at `localhost:5173` with Tailwind + shadcn/ui wired up and a react-router `<Routes>` shell with placeholder pages, ready for Task 11 onward to fill in.

- [ ] **Step 1: Scaffold**

Run (from repo root):
```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
```

- [ ] **Step 2: Tailwind**

Run: `npm install -D tailwindcss postcss autoprefixer && npx tailwindcss init -p`

`frontend/tailwind.config.js`:
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
};
```

`frontend/src/index.css` (replace contents):
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 3: shadcn/ui**

Run: `npx shadcn@latest init` (accept defaults: TypeScript, default style, slate base color)
Run: `npx shadcn@latest add table dialog button input label` (the primitives Tasks 13-16 need — pages use plain `<form>` elements with these, not shadcn's `Form` wrapper, so it's not added)

- [ ] **Step 4: react-router + routing shell**

Run: `npm install react-router-dom`

`frontend/src/routes.tsx`:
```typescript
import { createBrowserRouter } from 'react-router-dom';

const Placeholder = ({ name }: { name: string }) => <div className="p-6">{name} page</div>;

export const router = createBrowserRouter([
  { path: '/login', element: <Placeholder name="Login" /> },
  { path: '/', element: <Placeholder name="Dashboard" /> },
  { path: '/users', element: <Placeholder name="Users" /> },
  { path: '/roles', element: <Placeholder name="Roles" /> },
  { path: '/permissions', element: <Placeholder name="Permissions" /> },
  { path: '/audit-log', element: <Placeholder name="Audit Log" /> },
]);
```

`frontend/src/App.tsx`:
```typescript
import { RouterProvider } from 'react-router-dom';
import { router } from './routes';

export default function App() {
  return <RouterProvider router={router} />;
}
```

- [ ] **Step 5: Verify manually**

Run: `npm run dev`
Expected: dev server starts on `http://localhost:5173`; visiting `/`, `/login`, `/users`, `/roles`, `/permissions`, `/audit-log` each render their placeholder text.

- [ ] **Step 6: Commit**

```bash
git add frontend
git commit -m "Scaffold React frontend with Vite, Tailwind, shadcn/ui, and routing shell"
```

---

## Task 11: API client + auth context + protected routes

**Files:**
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/lib/auth-context.tsx`
- Create: `frontend/src/lib/protected-route.tsx`
- Modify: `frontend/src/routes.tsx`
- Modify: `frontend/src/main.tsx`

**Interfaces:**
- Consumes: backend endpoints from Tasks 4/6/7/8 at `http://localhost:3000`.
- Produces: `apiFetch(path, options)` (auto-attaches access token, retries once via `/auth/refresh` on 401) used by every page from Task 12 onward; `useAuth()` hook (`{ user, login, logout }`); `<ProtectedRoute>` wrapper.

- [ ] **Step 1: Token storage + `apiFetch`**

`frontend/src/lib/api.ts`:
```typescript
const API_BASE = 'http://localhost:3000';

let accessToken: string | null = localStorage.getItem('accessToken');
let refreshToken: string | null = localStorage.getItem('refreshToken');

export function setTokens(tokens: { accessToken: string; refreshToken: string } | null) {
  accessToken = tokens?.accessToken ?? null;
  refreshToken = tokens?.refreshToken ?? null;
  if (tokens) {
    localStorage.setItem('accessToken', tokens.accessToken);
    localStorage.setItem('refreshToken', tokens.refreshToken);
  } else {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }
}

export function getAccessToken() {
  return accessToken;
}

async function tryRefresh(): Promise<boolean> {
  if (!refreshToken) return false;
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return false;
  setTokens(await res.json());
  return true;
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const doFetch = () =>
    fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...options.headers,
      },
    });

  let res = await doFetch();
  if (res.status === 401 && (await tryRefresh())) {
    res = await doFetch();
  }
  return res;
}
```

- [ ] **Step 2: `AuthContext`**

`frontend/src/lib/auth-context.tsx`:
```typescript
import { createContext, useContext, useState, ReactNode } from 'react';
import { apiFetch, setTokens, getAccessToken } from './api';

type AuthState = {
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(!!getAccessToken());

  async function login(email: string, password: string) {
    const res = await fetch('http://localhost:3000/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error('Invalid credentials');
    setTokens(await res.json());
    setIsAuthenticated(true);
  }

  async function logout() {
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) await apiFetch('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) });
    setTokens(null);
    setIsAuthenticated(false);
  }

  return <AuthContext.Provider value={{ isAuthenticated, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 3: `ProtectedRoute`**

`frontend/src/lib/protected-route.tsx`:
```typescript
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './auth-context';

export function ProtectedRoute() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
}
```

- [ ] **Step 4: Wrap the router in `AuthProvider`, gate all pages except `/login`**

`frontend/src/routes.tsx`:
```typescript
import { createBrowserRouter } from 'react-router-dom';
import { ProtectedRoute } from './lib/protected-route';

const Placeholder = ({ name }: { name: string }) => <div className="p-6">{name} page</div>;

export const router = createBrowserRouter([
  { path: '/login', element: <Placeholder name="Login" /> },
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/', element: <Placeholder name="Dashboard" /> },
      { path: '/users', element: <Placeholder name="Users" /> },
      { path: '/roles', element: <Placeholder name="Roles" /> },
      { path: '/permissions', element: <Placeholder name="Permissions" /> },
      { path: '/audit-log', element: <Placeholder name="Audit Log" /> },
    ],
  },
]);
```

`frontend/src/App.tsx`:
```typescript
import { RouterProvider } from 'react-router-dom';
import { router } from './routes';
import { AuthProvider } from './lib/auth-context';

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
```

- [ ] **Step 5: Verify manually**

Run backend (`npm run start:dev` in `backend/`) and frontend (`npm run dev` in `frontend/`).
Visit `http://localhost:5173/users` while logged out → redirected to `/login`.

- [ ] **Step 6: Commit**

```bash
git add frontend
git commit -m "Add API client, auth context, and protected routes"
```

---

## Task 12: Login page

**Files:**
- Create: `frontend/src/pages/LoginPage.tsx`
- Modify: `frontend/src/routes.tsx`

**Interfaces:**
- Consumes: `useAuth().login` (Task 11).
- Produces: a working login form; on success, navigates to `/`.

- [ ] **Step 1: `LoginPage`**

`frontend/src/pages/LoginPage.tsx`:
```typescript
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '../lib/auth-context';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await login(email, password);
      navigate('/');
    } catch {
      setError('Invalid email or password');
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form onSubmit={onSubmit} className="w-80 space-y-4">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" className="w-full">Sign in</Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Wire into router**

In `frontend/src/routes.tsx`, replace the `/login` placeholder:
```typescript
import { LoginPage } from './pages/LoginPage';
// ...
{ path: '/login', element: <LoginPage /> },
```

- [ ] **Step 3: Verify manually**

With backend running and seeded (Task 3), log in as `admin@example.com` / `Admin123!` at `http://localhost:5173/login`.
Expected: redirected to `/` (Dashboard placeholder); `localStorage` has `accessToken`/`refreshToken`.

- [ ] **Step 4: Commit**

```bash
git add frontend
git commit -m "Add login page"
```

---

## Task 13: Users page — list, create/edit, assign roles

**Files:**
- Create: `frontend/src/pages/UsersPage.tsx`
- Modify: `frontend/src/routes.tsx`

**Interfaces:**
- Consumes: `apiFetch` (Task 11), `GET/PATCH /users`, `POST/DELETE /users/:id/roles/:roleId`, `GET /roles` (Tasks 6-7).
- Produces: the admin's user-management screen. Registration itself (creating brand-new users) stays on `/auth/register` via `curl`/API for v1, matching the spec's "Users module manages existing users" scope decision from Task 6 — this page covers list/deactivate/role-assignment.

- [ ] **Step 1: `UsersPage`**

`frontend/src/pages/UsersPage.tsx`:
```typescript
import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

type Role = { id: string; name: string };
type User = { id: string; email: string; isActive: boolean; roles: Role[] };

export function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [editing, setEditing] = useState<User | null>(null);

  async function reload() {
    const [usersRes, rolesRes] = await Promise.all([apiFetch('/users'), apiFetch('/roles')]);
    setUsers(await usersRes.json());
    setRoles(await rolesRes.json());
  }

  useEffect(() => {
    void reload();
  }, []);

  async function toggleActive(user: User) {
    await apiFetch(`/users/${user.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !user.isActive }) });
    await reload();
  }

  async function toggleRole(user: User, role: Role) {
    const has = user.roles.some((r) => r.id === role.id);
    await apiFetch(`/users/${user.id}/roles/${role.id}`, { method: has ? 'DELETE' : 'POST' });
    await reload();
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Users</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Active</TableHead>
            <TableHead>Roles</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell>{user.email}</TableCell>
              <TableCell>
                <Button variant="outline" size="sm" onClick={() => toggleActive(user)}>
                  {user.isActive ? 'Active' : 'Inactive'}
                </Button>
              </TableCell>
              <TableCell>{user.roles.map((r) => r.name).join(', ') || '—'}</TableCell>
              <TableCell>
                <Dialog open={editing?.id === user.id} onOpenChange={(open) => setEditing(open ? user : null)}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">Assign roles</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Roles for {user.email}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2">
                      {roles.map((role) => (
                        <label key={role.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={user.roles.some((r) => r.id === role.id)}
                            onChange={() => toggleRole(user, role)}
                          />
                          {role.name}
                        </label>
                      ))}
                    </div>
                  </DialogContent>
                </Dialog>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 2: Wire into router**

In `frontend/src/routes.tsx`:
```typescript
import { UsersPage } from './pages/UsersPage';
// ...
{ path: '/users', element: <UsersPage /> },
```

- [ ] **Step 3: Verify manually**

Log in as admin, visit `/users`. Expected: table lists the seeded admin (and any test users left over from backend e2e runs — acceptable, these are dev-DB artifacts). Toggling "Active" and checking a role box both persist across a page refresh.

- [ ] **Step 4: Commit**

```bash
git add frontend
git commit -m "Add users admin page"
```

---

## Task 14: Roles page — list, create/edit, assign permissions

**Files:**
- Create: `frontend/src/pages/RolesPage.tsx`
- Modify: `frontend/src/routes.tsx`

**Interfaces:**
- Consumes: `apiFetch`, `GET/POST/PATCH/DELETE /roles`, `POST/DELETE /roles/:id/permissions/:permissionId`, `GET /permissions`.

- [ ] **Step 1: `RolesPage`**

`frontend/src/pages/RolesPage.tsx`:
```typescript
import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

type Permission = { id: string; resource: string; action: string };
type Role = { id: string; name: string; description: string | null; permissions: Permission[] };

export function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<Role | null>(null);

  async function reload() {
    const [rolesRes, permissionsRes] = await Promise.all([apiFetch('/roles'), apiFetch('/permissions')]);
    setRoles(await rolesRes.json());
    setPermissions(await permissionsRes.json());
  }

  useEffect(() => {
    void reload();
  }, []);

  async function createRole() {
    if (!newName.trim()) return;
    await apiFetch('/roles', { method: 'POST', body: JSON.stringify({ name: newName }) });
    setNewName('');
    await reload();
  }

  async function deleteRole(role: Role) {
    await apiFetch(`/roles/${role.id}`, { method: 'DELETE' });
    await reload();
  }

  async function togglePermission(role: Role, permission: Permission) {
    const has = role.permissions.some((p) => p.id === permission.id);
    await apiFetch(`/roles/${role.id}/permissions/${permission.id}`, { method: has ? 'DELETE' : 'POST' });
    await reload();
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Roles</h1>
      <div className="flex gap-2">
        <Input placeholder="New role name" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <Button onClick={createRole}>Create</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Permissions</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {roles.map((role) => (
            <TableRow key={role.id}>
              <TableCell>{role.name}</TableCell>
              <TableCell>
                {role.permissions.map((p) => `${p.resource}:${p.action}`).join(', ') || '—'}
              </TableCell>
              <TableCell className="flex gap-2">
                <Dialog open={editing?.id === role.id} onOpenChange={(open) => setEditing(open ? role : null)}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">Assign permissions</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Permissions for {role.name}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2">
                      {permissions.map((permission) => (
                        <label key={permission.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={role.permissions.some((p) => p.id === permission.id)}
                            onChange={() => togglePermission(role, permission)}
                          />
                          {permission.resource}:{permission.action}
                        </label>
                      ))}
                    </div>
                  </DialogContent>
                </Dialog>
                <Button variant="destructive" size="sm" onClick={() => deleteRole(role)}>Delete</Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 2: Wire into router**

In `frontend/src/routes.tsx`:
```typescript
import { RolesPage } from './pages/RolesPage';
// ...
{ path: '/roles', element: <RolesPage /> },
```

- [ ] **Step 3: Verify manually**

As admin, create a role, check a permission box, refresh, confirm it persisted; delete the role, confirm it disappears.

- [ ] **Step 4: Commit**

```bash
git add frontend
git commit -m "Add roles admin page"
```

---

## Task 15: Permissions page — list, create

**Files:**
- Create: `frontend/src/pages/PermissionsPage.tsx`
- Modify: `frontend/src/routes.tsx`

**Interfaces:**
- Consumes: `apiFetch`, `GET/POST/DELETE /permissions`.

- [ ] **Step 1: `PermissionsPage`**

`frontend/src/pages/PermissionsPage.tsx`:
```typescript
import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Permission = { id: string; resource: string; action: string };

export function PermissionsPage() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [resource, setResource] = useState('');
  const [action, setAction] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const res = await apiFetch('/permissions');
    setPermissions(await res.json());
  }

  useEffect(() => {
    void reload();
  }, []);

  async function create() {
    setError(null);
    if (!resource.trim() || !action.trim()) return;
    const res = await apiFetch('/permissions', { method: 'POST', body: JSON.stringify({ resource, action }) });
    if (!res.ok) {
      setError('That resource:action already exists');
      return;
    }
    setResource('');
    setAction('');
    await reload();
  }

  async function remove(permission: Permission) {
    await apiFetch(`/permissions/${permission.id}`, { method: 'DELETE' });
    await reload();
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Permissions</h1>
      <div className="flex gap-2">
        <Input placeholder="resource (e.g. post)" value={resource} onChange={(e) => setResource(e.target.value)} />
        <Input placeholder="action (e.g. delete)" value={action} onChange={(e) => setAction(e.target.value)} />
        <Button onClick={create}>Create</Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Resource</TableHead>
            <TableHead>Action</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {permissions.map((permission) => (
            <TableRow key={permission.id}>
              <TableCell>{permission.resource}</TableCell>
              <TableCell>{permission.action}</TableCell>
              <TableCell>
                <Button variant="destructive" size="sm" onClick={() => remove(permission)}>Delete</Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 2: Wire into router**

In `frontend/src/routes.tsx`:
```typescript
import { PermissionsPage } from './pages/PermissionsPage';
// ...
{ path: '/permissions', element: <PermissionsPage /> },
```

- [ ] **Step 3: Verify manually**

Create a permission, confirm it appears and is selectable on the Roles page's assign-permissions dialog (Task 14); delete it, confirm it's gone from both.

- [ ] **Step 4: Commit**

```bash
git add frontend
git commit -m "Add permissions admin page"
```

---

## Task 16: Audit log page — read-only, filterable

**Files:**
- Create: `backend/src/audit/audit.controller.ts` (read endpoint — not covered by any earlier task)
- Modify: `backend/src/audit/audit.module.ts`
- Create: `frontend/src/pages/AuditLogPage.tsx`
- Modify: `frontend/src/routes.tsx`
- Test: `backend/test/audit-log-read.e2e-spec.ts`

**Interfaces:**
- Produces: `GET /audit-log?actorUserId=&targetType=` (guarded by `user:manage` — audit visibility is an admin concern, reusing the existing permission rather than minting a new one) and its frontend page.

- [ ] **Step 1: Write the failing backend test**

`backend/test/audit-log-read.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Audit log read (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let adminId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    const auth = moduleRef.get(AuthService);
    adminToken = (await auth.login('admin@example.com', 'Admin123!')).accessToken;
    adminId = (await prisma.user.findUniqueOrThrow({ where: { email: 'admin@example.com' } })).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists audit log entries, filterable by actorUserId', async () => {
    await prisma.auditLog.create({
      data: { actorUserId: adminId, action: 'role:assign', targetType: 'UserRole', targetId: 'x', meta: {} },
    });

    const res = await request(app.getHttpServer())
      .get(`/audit-log?actorUserId=${adminId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.every((log: any) => log.actorUserId === adminId)).toBe(true);
  });
});
```

Run: `npm run test:e2e -- audit-log-read`
Expected: FAIL (no `GET /audit-log` route).

- [ ] **Step 2: `AuditController`**

`backend/src/audit/audit.controller.ts`:
```typescript
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Controller('audit-log')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('user:manage')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@Query('actorUserId') actorUserId?: string, @Query('targetType') targetType?: string) {
    return this.prisma.auditLog.findMany({
      where: { ...(actorUserId && { actorUserId }), ...(targetType && { targetType }) },
      orderBy: { createdAt: 'desc' },
    });
  }
}
```

- [ ] **Step 3: Register the controller**

`backend/src/audit/audit.module.ts` — add `controllers: [AuditController]` alongside the existing `providers`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:e2e -- audit-log-read`
Expected: PASS.

- [ ] **Step 5: Commit backend change**

```bash
git add backend/src backend/test
git commit -m "Add audit log read endpoint"
```

- [ ] **Step 6: `AuditLogPage`**

`frontend/src/pages/AuditLogPage.tsx`:
```typescript
import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type AuditLog = {
  id: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  createdAt: string;
};

export function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [targetType, setTargetType] = useState('');

  useEffect(() => {
    const query = targetType ? `?targetType=${encodeURIComponent(targetType)}` : '';
    void apiFetch(`/audit-log${query}`)
      .then((res) => res.json())
      .then(setLogs);
  }, [targetType]);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Audit Log</h1>
      <Input
        placeholder="Filter by target type (e.g. UserRole)"
        value={targetType}
        onChange={(e) => setTargetType(e.target.value)}
        className="max-w-xs"
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Target</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell>{new Date(log.createdAt).toLocaleString()}</TableCell>
              <TableCell>{log.actorUserId}</TableCell>
              <TableCell>{log.action}</TableCell>
              <TableCell>{log.targetType}:{log.targetId}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 7: Wire into router**

In `frontend/src/routes.tsx`:
```typescript
import { AuditLogPage } from './pages/AuditLogPage';
// ...
{ path: '/audit-log', element: <AuditLogPage /> },
```

- [ ] **Step 8: Verify manually**

Assign/remove a role on the Users page (Task 13), then visit `/audit-log` — the new entries appear, newest first; filtering by `UserRole` narrows the list.

- [ ] **Step 9: Commit frontend change**

```bash
git add frontend
git commit -m "Add audit log page"
```

---

## Task 17: Full dev stack via docker-compose

**Files:**
- Create: `backend/Dockerfile.dev`
- Create: `frontend/Dockerfile.dev`
- Modify: `docker-compose.yml` (add `api` and `web` services)

**Interfaces:**
- Consumes: `postgres` service (Task 1), `backend/`, `frontend/` (all prior tasks).
- Produces: `docker compose up` brings up the full stack (Postgres + API + Web) for local development.

- [ ] **Step 1: Backend dev Dockerfile**

`backend/Dockerfile.dev`:
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "start:dev"]
```

- [ ] **Step 2: Frontend dev Dockerfile**

`frontend/Dockerfile.dev`:
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]
```

(`--host` so Vite binds `0.0.0.0` and is reachable from outside the container.)

- [ ] **Step 3: Extend `docker-compose.yml`**

Add to the existing `services:` block from Task 1:
```yaml
  api:
    build:
      context: ./backend
      dockerfile: Dockerfile.dev
    restart: unless-stopped
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?schema=public
      JWT_ACCESS_SECRET: dev-access-secret-change-me
      JWT_ACCESS_EXPIRES_IN: 15m
      REFRESH_TOKEN_TTL_DAYS: "7"
    ports:
      - "3000:3000"
    volumes:
      - ./backend:/app
      - /app/node_modules
    depends_on:
      - postgres

  web:
    build:
      context: ./frontend
      dockerfile: Dockerfile.dev
    restart: unless-stopped
    ports:
      - "5173:5173"
    volumes:
      - ./frontend:/app
      - /app/node_modules
    depends_on:
      - api
```

Note: inside the `api` container, `DATABASE_URL` points at the `postgres` service name, not `localhost` — the Prisma client resolves that hostname on the compose network.

- [ ] **Step 4: Verify manually**

Run: `docker compose up --build`
Expected: all three containers start; `http://localhost:3000/health` returns `{"status":"ok"}`; `http://localhost:5173` loads the login page. Run migration + seed once against the containerized DB: `docker compose exec api npx prisma migrate deploy && docker compose exec api npx prisma db seed`.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml backend/Dockerfile.dev frontend/Dockerfile.dev
git commit -m "Add full dev stack (Postgres, API, Web) to docker-compose"
```

---

## Post-plan notes

- Spec coverage: auth/JWT (Task 4), users/roles/permissions CRUD (Tasks 6-8, 13-15), multi-role + resource:action permissions (Tasks 3, 5), audit log (Tasks 9, 16), all 6 frontend pages (Tasks 10, 12-16), dev docker-compose (Tasks 1, 17). Everything in the spec's scope is covered; nothing in "Out of scope (v1)" was added.
