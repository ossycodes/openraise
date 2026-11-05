import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { CampaignsModule } from './campaigns/campaigns.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { validateEnv } from './config/env.js';
import { FeesModule } from './fees/fees.module.js';
import { HealthController } from './health/health.controller.js';
import { MailModule } from './mail/mail.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { StorageModule } from './storage/storage.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    MailModule,
    StorageModule,
    FeesModule,
    AuthModule,
    UsersModule,
    CategoriesModule,
    CampaignsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
