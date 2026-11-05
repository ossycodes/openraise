import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';

export interface SiteConfig {
  name: string;
  logoUrl: string | null;
  /** #rrggbb, used as the web app's accent colour */
  primaryColor: string | null;
  supportEmail: string | null;
  /** Public OAuth client ID for "Sign in with Google"; null when disabled */
  googleClientId: string | null;
}

/** The deployment's branding, public so the web app and others can render it. */
@Controller('config/site')
export class SiteController {
  constructor(private readonly config: ConfigService<Env, true>) {}

  @Get()
  get(): SiteConfig {
    return {
      name: this.config.get('SITE_NAME'),
      logoUrl: this.config.get('SITE_LOGO_URL') ?? null,
      primaryColor: this.config.get('SITE_PRIMARY_COLOR') ?? null,
      supportEmail: this.config.get('SITE_SUPPORT_EMAIL') ?? null,
      googleClientId: this.config.get('GOOGLE_CLIENT_ID') ?? null,
    };
  }
}
