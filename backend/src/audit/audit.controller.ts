import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Controller('audit-log')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('user:manage')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@Query('actorUserId') actorUserId?: string, @Query('targetType') targetType?: string) {
    return this.prisma.auditLog.findMany({
      where: { ...(actorUserId && { actorUserId }), ...(targetType && { targetType }) },
      orderBy: { createdAt: 'desc' },
    });
  }
}
