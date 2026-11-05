import { hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash).toMatch(/^scrypt\$32768\$8\$1\$[^$]+\$[^$]+$/);
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
    expect(await verifyPassword('correct horse battery!', hash)).toBe(false);
  });

  it('salts every hash', async () => {
    const [a, b] = await Promise.all([
      hashPassword('same password'),
      hashPassword('same password'),
    ]);
    expect(a).not.toBe(b);
  });

  it('treats Unicode-equivalent passwords as the same', async () => {
    const hash = await hashPassword('café-password'); // é as one code point
    expect(await verifyPassword('café-password', hash)).toBe(true); // e + accent
  });

  it('returns false for malformed hashes instead of throwing', async () => {
    for (const bad of ['', 'scrypt$1$2', 'bcrypt$a$b$c$d$e', 'scrypt$x$8$1$aa$bb']) {
      expect(await verifyPassword('anything', bad)).toBe(false);
    }
  });
});
