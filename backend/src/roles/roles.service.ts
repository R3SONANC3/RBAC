import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly withPermissions = { permissions: { include: { permission: true } } };

  create(data: { name: string; description?: string }) {
    return this.prisma.role.create({ data }).then(this.toDto.bind(this, []));
  }

  async list() {
    const roles = await this.prisma.role.findMany({ include: this.withPermissions });
    return roles.map((r) => this.toDtoFull(r));
  }

  async get(id: string) {
    const role = await this.prisma.role.findUniqueOrThrow({ where: { id }, include: this.withPermissions });
    return this.toDtoFull(role);
  }

  async update(id: string, data: { name?: string; description?: string }) {
    const role = await this.prisma.role.update({ where: { id }, data, include: this.withPermissions });
    return this.toDtoFull(role);
  }

  async delete(id: string) {
    await this.prisma.role.delete({ where: { id } });
  }

  async assignPermission(roleId: string, permissionId: string) {
    await this.prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId, permissionId } },
      create: { roleId, permissionId },
      update: {},
    });
  }

  async removePermission(roleId: string, permissionId: string) {
    await this.prisma.rolePermission.deleteMany({ where: { roleId, permissionId } });
  }

  private toDto(permissions: { id: string; resource: string; action: string }[], role: { id: string; name: string; description: string | null }) {
    return { id: role.id, name: role.name, description: role.description, permissions };
  }

  private toDtoFull(role: {
    id: string;
    name: string;
    description: string | null;
    permissions: { permission: { id: string; resource: string; action: string } }[];
  }) {
    return this.toDto(role.permissions.map((rp) => rp.permission), role);
  }
}
