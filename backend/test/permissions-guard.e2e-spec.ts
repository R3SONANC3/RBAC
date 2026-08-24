import { Test } from '@nestjs/testing';
import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import request from 'supertest';
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
  const email = `guard-${Date.now()}@example.com`;

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
    await prisma.user.deleteMany({ where: { email } });
    await prisma.role.deleteMany({ where: { name: { startsWith: 'guard-role-' } } });
    await app.close();
  });

  it('denies access when the user has no matching permission, allows once granted', async () => {
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

  it('returns 401 when there is no valid auth token at all', async () => {
    const res = await request(app.getHttpServer()).get('/test-protected');
    expect(res.status).toBe(401);
  });
});
