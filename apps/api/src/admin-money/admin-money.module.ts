import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard.js';
import { AdminMoneyController } from './admin-money.controller.js';
import { AdminMoneyService } from './admin-money.service.js';
@Module({
  controllers: [AdminMoneyController],
  providers: [AdminMoneyService, RolesGuard],
})
export class AdminMoneyModule {}
