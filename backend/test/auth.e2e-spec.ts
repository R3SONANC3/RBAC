import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `test-${Date.now()}@example.com`;
  const password = 'SuperSecret123';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
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
    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password });
    expect(registerRes.status).toBe(201);
    expect(registerRes.body).toMatchObject({ email });

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password });
    expect(loginRes.status).toBe(200);
    const loginBody = loginRes.body as TokenPair;
    expect(loginBody.accessToken).toBeDefined();
    expect(loginBody.refreshToken).toBeDefined();

    const refreshRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: loginBody.refreshToken });
    expect(refreshRes.status).toBe(200);
    const refreshBody = refreshRes.body as TokenPair;
    expect(refreshBody.accessToken).toBeDefined();
    expect(refreshBody.refreshToken).not.toBe(loginBody.refreshToken);

    // old refresh token is now revoked (rotated) — reusing it must fail
    const reuseRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: loginBody.refreshToken });
    expect(reuseRes.status).toBe(401);

    const logoutRes = await request(app.getHttpServer())
      .post('/auth/logout')
      .send({ refreshToken: refreshBody.refreshToken });
    expect(logoutRes.status).toBe(204);
  });

  it('rejects login with wrong password', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('rejects a non-string password with 400, not a 500 crash', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: { a: 1 } });
    expect(res.status).toBe(400);
  });

  it('rejects a non-string refreshToken with 400, not a 500 crash', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: 123 });
    expect(res.status).toBe(400);
  });

  it('rejects login and refresh for a deactivated user', async () => {
    const deactivatedEmail = `deactivated-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: deactivatedEmail, password });

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: deactivatedEmail, password });
    expect(loginRes.status).toBe(200);
    const { refreshToken } = loginRes.body as TokenPair;

    await prisma.user.update({
      where: { email: deactivatedEmail },
      data: { isActive: false },
    });

    const blockedLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: deactivatedEmail, password });
    expect(blockedLogin.status).toBe(401);

    const blockedRefresh = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken });
    expect(blockedRefresh.status).toBe(401);

    await prisma.user.deleteMany({ where: { email: deactivatedEmail } });
  });
});
