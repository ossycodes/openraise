import { Module } from '@nestjs/common';
import {
  OrganisationInvitesController,
  OrganisationsController,
} from './organisations.controller.js';
import { OrganisationsService } from './organisations.service.js';

@Module({
  controllers: [OrganisationsController, OrganisationInvitesController],
  providers: [OrganisationsService],
  exports: [OrganisationsService],
})
export class OrganisationsModule {}
