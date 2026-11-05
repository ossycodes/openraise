import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.js';
import { FeesModule } from './fees/fees.module.js';
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    FeesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
