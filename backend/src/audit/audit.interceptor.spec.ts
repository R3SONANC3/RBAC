import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { AuditInterceptor } from './audit.interceptor';
import { PrismaService } from '../prisma/prisma.service';

describe('AuditInterceptor', () => {
  function buildContext(): ExecutionContext {
    return {
      getHandler: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          user: { sub: 'user-1' },
          params: { id: 'user-1', roleId: 'role-1' },
        }),
      }),
    } as unknown as ExecutionContext;
  }

  function buildNext(result: unknown): CallHandler {
    return { handle: () => of(result) };
  }

  it('lets the response through even if the audit write rejects', (done) => {
    const reflector = { get: () => 'role:assign' } as unknown as Reflector;
    const prisma = {
      auditLog: { create: jest.fn().mockRejectedValue(new Error('db down')) },
    } as unknown as PrismaService;
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const interceptor = new AuditInterceptor(reflector, prisma);
    interceptor.intercept(buildContext(), buildNext({ ok: true })).subscribe({
      next: (result) => {
        expect(result).toEqual({ ok: true });
      },
      error: (err) => done(err),
      complete: () => {
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
        done();
      },
    });
  });

  it('writes the audit log and passes the response through on success', (done) => {
    const reflector = { get: () => 'role:assign' } as unknown as Reflector;
    const create = jest.fn().mockResolvedValue({ id: 'log-1' });
    const prisma = { auditLog: { create } } as unknown as PrismaService;

    const interceptor = new AuditInterceptor(reflector, prisma);
    interceptor.intercept(buildContext(), buildNext({ ok: true })).subscribe({
      next: (result) => expect(result).toEqual({ ok: true }),
      error: (err) => done(err),
      complete: () => {
        expect(create).toHaveBeenCalledWith({
          data: {
            actorUserId: 'user-1',
            action: 'role:assign',
            targetType: 'UserRole',
            targetId: 'role-1',
            meta: { id: 'user-1', roleId: 'role-1' },
          },
        });
        done();
      },
    });
  });
});
