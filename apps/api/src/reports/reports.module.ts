import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard.js';
import { CampaignsModule } from '../campaigns/campaigns.module.js';
import {
  PublicReportsController,
  AdminReportsController,
} from './reports.controller.js';
import { ReportsService } from './reports.service.js';
@Module({
  imports: [CampaignsModule],
  controllers: [PublicReportsController, AdminReportsController],
  providers: [ReportsService, RolesGuard],
})
export class ReportsModule {}
