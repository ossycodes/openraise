import {
  Controller,
  HttpCode,
  Param,
  Post,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import { WebhooksService } from './webhooks.service.js';
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}
  @Post(':provider')
  @HttpCode(202)
  accept(
    @Param('provider') provider: string,
    @Req() request: RawBodyRequest<Request>,
  ) {
    return this.webhooks.accept(provider, request.rawBody, request.headers);
  }
}
