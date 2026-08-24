import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
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
