import { z } from 'zod';
import { KycProviderError } from './kyc-provider.js';

/**
 * Minimal JSON/multipart transport for KYC vendor adapters. Never exposes
 * response bodies, credentials or transport error messages, and never
 * retries: a timed-out write may already have started a paid vendor check.
 */
export class VendorHttp {
  constructor(
    private readonly baseUrl: string,
    private readonly transport: typeof fetch = fetch,
    private readonly timeoutMs = 15_000,
  ) {}

  async json(
    path: string,
    init: {
      method?: 'GET' | 'POST';
      headers?: Record<string, string>;
      body?: unknown;
    } = {},
  ): Promise<{ status: number; value: unknown }> {
    const response = await this.raw(path, {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      headers: {
        Accept: 'application/json',
        ...(init.body !== undefined
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...init.headers,
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    try {
      return { status: response.status, value: await response.json() };
    } catch {
      throw new KycProviderError('invalid-response', response.status);
    }
  }

  async form(
    path: string,
    fields: Record<string, string>,
    headers: Record<string, string> = {},
  ): Promise<{ status: number; value: unknown }> {
    const body = new FormData();
    for (const [key, value] of Object.entries(fields)) body.set(key, value);
    const response = await this.raw(path, {
      method: 'POST',
      headers: { Accept: 'application/json', ...headers },
      body,
    });
    try {
      return { status: response.status, value: await response.json() };
    } catch {
      throw new KycProviderError('invalid-response', response.status);
    }
  }

  private async raw(path: string, init: RequestInit): Promise<Response> {
    try {
      return await this.transport(`${this.baseUrl}${path}`, {
        ...init,
        signal: AbortSignal.timeout(this.timeoutMs),
        redirect: 'error',
      });
    } catch {
      throw new KycProviderError('transport-error');
    }
  }
}

/** A 4xx that means "this ID was checked and not found / not matched". */
export function isNotFound(status: number): boolean {
  return status === 404;
}

export function ensureOk(status: number): void {
  if (status >= 200 && status < 300) return;
  throw new KycProviderError('http-error', status);
}

export function read<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new KycProviderError('invalid-response');
  return result.data;
}
