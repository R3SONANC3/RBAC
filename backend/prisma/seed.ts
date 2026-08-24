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
