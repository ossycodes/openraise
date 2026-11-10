import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard.js';
import {
  AdminOrganisationChecksController,
  OrganisationVerificationController,
} from './organisation-verification.controller.js';
import { OrganisationVerificationService } from './organisation-verification.js';
import {
  OrganisationInvitesController,
  OrganisationsController,
} from './organisations.controller.js';
import { OrganisationsService } from './organisations.service.js';

@Module({
  controllers: [
    // Before OrganisationsController so ':id/verification' is matched here.
    OrganisationVerificationController,
    OrganisationsController,
    OrganisationInvitesController,
    AdminOrganisationChecksController,
  ],
  providers: [OrganisationsService, OrganisationVerificationService, RolesGuard],
  exports: [OrganisationsService, OrganisationVerificationService],
})
export class OrganisationsModule {}
