import { Global, Module } from '@nestjs/common';
import { AuditInterceptor } from './audit.interceptor';

@Global()
@Module({
  providers: [AuditInterceptor],
  exports: [AuditInterceptor],
})
export class AuditModule {}
