import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AuditService } from './audit.service.js';
import { auditQuerySchema, type AuditQuery } from './audit.schemas.js';
@Controller('admin/audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AuditController {
  constructor(private readonly audit: AuditService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query(new ZodValidationPipe(auditQuerySchema)) q: AuditQuery) {
    return this.audit.list(q);
  }
}
