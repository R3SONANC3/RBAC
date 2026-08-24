import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
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
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    const auth = moduleRef.get(AuthService);
    adminToken = (await auth.login('admin@example.com', 'Admin123!'))
      .accessToken;
    adminId = (
      await prisma.user.findUniqueOrThrow({
        where: { email: 'admin@example.com' },
      })
    ).id;

    const role = await prisma.role.create({
      data: { name: `audit-role-${Date.now()}` },
    });
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

    const logs = await prisma.auditLog.findMany({
      where: { targetType: 'UserRole', targetId: roleId },
    });
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].actorUserId).toBe(adminId);
    expect(logs[0].action).toBe('role:assign');
  });
});
