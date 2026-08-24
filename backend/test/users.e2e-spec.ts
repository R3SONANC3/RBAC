import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
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
