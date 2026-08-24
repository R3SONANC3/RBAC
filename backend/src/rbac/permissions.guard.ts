import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { PERMISSION_KEY } from './require-permission.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<string>(PERMISSION_KEY, context.getHandler());
    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request.user?.sub;
    if (!userId) throw new ForbiddenException('Not authenticated');

    const [resource, action] = required.split(':');
    const match = await this.prisma.userRole.findFirst({
      where: {
        userId,
        role: { permissions: { some: { permission: { resource, action } } } },
      },
    });

    if (!match) throw new ForbiddenException(`Missing permission: ${required}`);
    return true;
  }
}
