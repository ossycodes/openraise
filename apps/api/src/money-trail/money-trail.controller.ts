import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { MoneyTrailService } from './money-trail.service.js';
const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
});
@Controller('campaigns')
export class MoneyTrailController {
  constructor(private readonly trail: MoneyTrailService) {}
  @Get(':slug/money-trail')
  @Header('Cache-Control', 'no-store')
  get(
    @Param('slug') slug: string,
    @Query(new ZodValidationPipe(querySchema)) query: { page: number },
  ) {
    return this.trail.get(slug, query.page);
  }
}
