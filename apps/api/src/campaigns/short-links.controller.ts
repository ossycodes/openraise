import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
} from '@nestjs/common';
import { CampaignsService } from './campaigns.service.js';

/**
 * Resolves the short links printed on posters and QR codes (/c/<code> on the
 * web) to a public campaign's slug. Kept off /campaigns so a code can never be
 * read as one of that controller's routes.
 */
@Controller('short-links')
export class ShortLinksController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get(':code')
  @Header('Cache-Control', 'public, max-age=300')
  resolve(@Param('code') code: string): Promise<{ slug: string }> {
    // Codes are typed from paper, so accept any case; anything else is unknown.
    if (!/^[a-z0-9]{5}$/i.test(code))
      throw new NotFoundException('Campaign not found');
    return this.campaigns.slugForShortCode(code);
  }
}
