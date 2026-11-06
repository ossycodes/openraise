import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  PayloadTooLargeException,
  Post,
  Query,
  Req,
  StreamableFile,
  UnsupportedMediaTypeException,
  UseGuards,
} from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { MAX_IMAGE_BYTES } from '../campaigns/image-type.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
  decisionSchema,
  queueSchema,
  submissionSchema,
  type DecisionInput,
  type QueueQuery,
  type SubmissionInput,
} from './kyc.schemas.js';
import { KycService } from './kyc.service.js';

/**
 * The request body as bytes, up to `limit`. ID photos are posted raw
 * (Content-Type image/*), which no global body parser touches.
 */
export function readBody(
  req: IncomingMessage,
  limit: number,
): Promise<Buffer> {
  if (!/^image\//i.test(req.headers['content-type'] ?? ''))
    return Promise.reject(
      new UnsupportedMediaTypeException(
        'Send the photo itself with an image Content-Type',
      ),
    );
  if (req.readableEnded)
    return Promise.reject(new BadRequestException('The photo was empty'));
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    req.on('data', (chunk: Buffer) => {
      if (settled) return;
      size += chunk.length;
      if (size > limit) {
        settled = true;
        reject(
          new PayloadTooLargeException('ID photos must be 5 MB or smaller'),
        );
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    });
    req.on('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

@Controller('kyc')
@UseGuards(JwtAuthGuard)
export class KycController {
  constructor(private readonly kyc: KycService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  status(@CurrentUser() user: AuthUser) {
    return this.kyc.status(user);
  }

  @Post('document')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  async document(@CurrentUser() user: AuthUser, @Req() req: IncomingMessage) {
    return this.kyc.uploadDocument(user, await readBody(req, MAX_IMAGE_BYTES));
  }

  @Post()
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  submit(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(submissionSchema)) body: SubmissionInput,
  ) {
    return this.kyc.submit(user, body);
  }
}

@Controller('admin/kyc')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminKycController {
  constructor(private readonly kyc: KycService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  queue(@Query(new ZodValidationPipe(queueSchema)) query: QueueQuery) {
    return this.kyc.queue(query);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  detail(@Param('id') id: string) {
    return this.kyc.detail(id);
  }

  @Get(':id/document')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'")
  async document(@Param('id') id: string) {
    const { bytes, contentType } = await this.kyc.document(id);
    return new StreamableFile(Buffer.from(bytes), {
      type: contentType,
      length: bytes.length,
      disposition: 'inline',
    });
  }

  @Post(':id/decision')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  decide(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(decisionSchema)) body: DecisionInput,
  ) {
    return this.kyc.decide(user, id, body);
  }
}
