import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard.js';
import { CategoriesController } from './categories.controller.js';
import { CategoriesService } from './categories.service.js';

@Module({
  controllers: [CategoriesController],
  providers: [CategoriesService, RolesGuard],
  exports: [CategoriesService],
})
export class CategoriesModule {}
