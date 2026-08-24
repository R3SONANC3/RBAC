import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
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
