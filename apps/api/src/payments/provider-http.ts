import { z } from 'zod';

export class PaymentProviderError extends Error {
  constructor(
    public readonly code:
      | 'invalid-input'
      | 'invalid-response'
      | 'http-error'
      | 'transport-error'
      | 'invalid-signature'
      | 'unsupported',
    public readonly status?: number,
    /** Reconcile writes before retrying: timeout or 5xx can follow a successful write. */
    public readonly uncertain = code === 'invalid-response',
  ) {
    super(`Payment provider ${code}${status ? ` (${status})` : ''}`);
    this.name = 'PaymentProviderError';
  }
}

/** Never exposes response bodies, credentials or transport error messages. No automatic retries. */
export class ProviderHttp {
  constructor(
    private readonly baseUrl: string,
    private readonly secret: string,
    private readonly transport: typeof fetch = fetch,
    private readonly timeoutMs = 10_000,
  ) {}

  async request(
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<unknown> {
    const write = body !== undefined;
    try {
      const response = await this.transport(`${this.baseUrl}${path}`, {
        method: write ? 'POST' : 'GET',
        headers: {
          Authorization: `Bearer ${this.secret}`,
          'Content-Type': 'application/json',
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        body: write ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
        redirect: 'error',
      });
      if (!response.ok) {
        throw new PaymentProviderError(
          'http-error',
          response.status,
          write &&
            (response.status >= 500 ||
              response.status === 408 ||
              response.status === 409),
        );
      }
      try {
        return await response.json();
      } catch {
        throw new PaymentProviderError('invalid-response', undefined, write);
      }
    } catch (error) {
      if (error instanceof PaymentProviderError) throw error;
      throw new PaymentProviderError('transport-error', undefined, write);
    }
  }
}

export function read<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new PaymentProviderError('invalid-response', undefined, true);
  return result.data;
}
export function input<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new PaymentProviderError('invalid-input');
  return result.data;
}
