import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard.js';
import { AuditController } from './audit.controller.js';
import { AuditService } from './audit.service.js';
@Module({
  controllers: [AuditController],
  providers: [AuditService, RolesGuard],
})
export class AuditModule {}
