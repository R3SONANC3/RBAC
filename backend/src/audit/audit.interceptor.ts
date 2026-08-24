import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { PrismaService } from '../prisma/prisma.service';
import { AUDIT_ACTION_KEY } from './audit.decorator';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const action = this.reflector.get<string>(
      AUDIT_ACTION_KEY,
      context.getHandler(),
    );
    if (!action) return next.handle();

    const request = context.switchToHttp().getRequest();
    const actorUserId: string = request.user.sub;
    const params = request.params;

    // Await the write instead of firing-and-forgetting it (the brief's original
    // `tap(() => void this.prisma.auditLog.create(...))` doesn't block the response,
    // so the row can still be in flight when a caller checks for it right after).
    return next.handle().pipe(
      switchMap((result) => {
        const [targetType, targetId] = this.resolveTarget(action, params);
        return from(
          this.prisma.auditLog.create({
            data: { actorUserId, action, targetType, targetId, meta: params },
          }),
        ).pipe(
          // The mutation in next.handle() already committed by this point — an audit
          // write failure (DB blip, dropped connection) must not turn that success
          // into a 500. Log it and let the original result through anyway.
          catchError((err) => {
            console.error('AuditInterceptor: failed to write audit log', err);
            return of(null);
          }),
          map(() => result),
        );
      }),
    );
  }

  private resolveTarget(
    action: string,
    params: Record<string, string>,
  ): [string, string] {
    if (action.startsWith('role:')) return ['UserRole', params.roleId];
    return ['RolePermission', params.permissionId];
  }
}
