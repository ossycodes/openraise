import { AuditModule } from './audit/audit.module.js';
import { MoneyTrailModule } from './money-trail/money-trail.module.js';
import { AdminMoneyModule } from './admin-money/admin-money.module.js';
import { RateLimitModule } from './rate-limit/rate-limit.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { WithdrawalsModule } from './withdrawals/withdrawals.module.js';
import { CampaignUpdatesModule } from './campaign-updates/campaign-updates.module.js';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { BankAccountsModule } from './bank-accounts/bank-accounts.module.js';
import { CampaignsModule } from './campaigns/campaigns.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { validateEnv } from './config/env.js';
import { CreatorMoneyModule } from './creator-money/creator-money.module.js';
import { DonationsModule } from './donations/donations.module.js';
import { FeesModule } from './fees/fees.module.js';
import { HealthController } from './health/health.controller.js';
import { LedgerModule } from './ledger/ledger.module.js';
import { MailModule } from './mail/mail.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SiteController } from './site/site.controller.js';
import { StorageModule } from './storage/storage.module.js';
import { WebhooksModule } from './webhooks/webhooks.module.js';
import { UsersModule } from './users/users.module.js';
import { KycModule } from './kyc/kyc.module.js';
import { OrganisationsModule } from './organisations/organisations.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    AuditModule,
    MailModule,
    StorageModule,
    LedgerModule,
    FeesModule,
    PaymentsModule,
    DonationsModule,
    WebhooksModule,
    AuthModule,
    RateLimitModule,
    AdminMoneyModule,
    UsersModule,
    CategoriesModule,
    CampaignsModule,
    MoneyTrailModule,
    ReportsModule,
    CampaignUpdatesModule,
    BankAccountsModule,
    WithdrawalsModule,
    CreatorMoneyModule,
    KycModule,
    OrganisationsModule,
  ],
  controllers: [HealthController, SiteController],
})
export class AppModule {}
