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
