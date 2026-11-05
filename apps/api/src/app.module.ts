import { WithdrawalsModule } from './withdrawals/withdrawals.module.js';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { BankAccountsModule } from './bank-accounts/bank-accounts.module.js';
import { CampaignsModule } from './campaigns/campaigns.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { validateEnv } from './config/env.js';
import { DonationsModule } from './donations/donations.module.js';
import { FeesModule } from './fees/fees.module.js';
import { HealthController } from './health/health.controller.js';
import { LedgerModule } from './ledger/ledger.module.js';
import { MailModule } from './mail/mail.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { StorageModule } from './storage/storage.module.js';
import { WebhooksModule } from './webhooks/webhooks.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    MailModule,
    StorageModule,
    LedgerModule,
    FeesModule,
    PaymentsModule,
    DonationsModule,
    WebhooksModule,
    AuthModule,
    UsersModule,
    CategoriesModule,
    CampaignsModule,
    BankAccountsModule,
    WithdrawalsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
