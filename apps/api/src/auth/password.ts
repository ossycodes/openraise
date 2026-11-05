import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';

/**
 * Password hashing with Node's built-in scrypt, so self-hosters never need
 * to compile a native module. Parameters are stored with each hash
 * ("scrypt$N$r$p$salt$hash") so they can be raised later without breaking
 * existing passwords.
 */
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

function scrypt(
  password: string,
  salt: Buffer,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, KEY_LENGTH, options, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

function options(n: number, r: number, p: number): ScryptOptions {
  // scrypt needs ~128 * N * r bytes; give it headroom.
  return { N: n, r, p, maxmem: 256 * n * r };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, options(N, R, P));
  return [
    'scrypt',
    N,
    R,
    P,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const params = [Number(n), Number(r), Number(p)];
  if (params.some((x) => !Number.isInteger(x) || x <= 0)) return false;

  const expected = Buffer.from(keyB64 ?? '', 'base64');
  if (expected.length !== KEY_LENGTH) return false;
  const [nn, rr, pp] = params as [number, number, number];
  const actual = await scrypt(
    password.normalize('NFKC'),
    Buffer.from(saltB64 ?? '', 'base64'),
    options(nn, rr, pp),
  );
  return timingSafeEqual(actual, expected);
}
