import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: { resource: string; action: string }) {
    try {
      return await this.prisma.permission.create({ data });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Permission ${data.resource}:${data.action} already exists`);
      }
      throw e;
    }
  }

  list() {
    return this.prisma.permission.findMany();
  }

  async delete(id: string) {
    await this.prisma.permission.delete({ where: { id } });
  }
}
