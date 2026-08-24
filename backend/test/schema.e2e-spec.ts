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
