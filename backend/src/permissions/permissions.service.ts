import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  create(data: { resource: string; action: string }) {
    // Duplicate resource:action (P2002) is mapped to 409 by the global
    // PrismaExceptionFilter (see prisma/prisma-exception.filter.ts).
    return this.prisma.permission.create({ data });
  }

  list() {
    return this.prisma.permission.findMany();
  }

  async delete(id: string) {
    await this.prisma.permission.delete({ where: { id } });
  }
}
