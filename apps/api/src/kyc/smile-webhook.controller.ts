import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import {
  KYC_PROVIDER,
  KycProviderError,
  type KycProvider,
  type WebhookHeaders,
} from './kyc-provider.js';
import { KycService } from './kyc.service.js';

/**
 * Later vendor results (Smile ID Enhanced KYC). The signature is verified
 * against the API key before anything is parsed; unknown or duplicate
 * results are acknowledged so the vendor stops retrying, and PENDING
 * outcomes leave the check for an administrator.
 */
@Controller('webhooks/kyc')
export class SmileWebhookController {
  constructor(
    private readonly kyc: KycService,
    @Inject(KYC_PROVIDER) private readonly provider: KycProvider,
  ) {}

  @Post('smile')
  @HttpCode(200)
  async smile(
    @Headers() headers: WebhookHeaders,
    @Body() body: unknown,
    @Query('token') token?: string,
  ) {
    if (!this.provider.verifyResult || !this.provider.parseResult)
      throw new NotFoundException();
    if (!this.provider.verifyResult(headers, body, token))
      throw new UnauthorizedException('Invalid signature');
    let event;
    try {
      event = this.provider.parseResult(body);
    } catch (error) {
      if (error instanceof KycProviderError)
        throw new BadRequestException('Invalid result');
      throw error;
    }
    if (!event) return { received: true };
    return { received: true, ...(await this.kyc.applyResult(event)) };
  }
}
