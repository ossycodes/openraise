import { Module } from '@nestjs/common';
import { MoneyTrailController } from './money-trail.controller.js';
import { MoneyTrailService } from './money-trail.service.js';
@Module({ controllers: [MoneyTrailController], providers: [MoneyTrailService] })
export class MoneyTrailModule {}
