import { SettingsService } from '../settings/settings.service.js';
import { Controller, Get, Header } from '@nestjs/common';
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
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly settings: SettingsService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async get(): Promise<SiteConfig> {
    const { values } = await this.settings.get();
    return {
      name: values.name,
      logoUrl: values.logoUrl,
      primaryColor: values.primaryColor,
      supportEmail: values.supportEmail,
      googleClientId: this.config.get('GOOGLE_CLIENT_ID') ?? null,
    };
  }
}
