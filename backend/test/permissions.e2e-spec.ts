import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
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
