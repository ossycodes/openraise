import { describe, expect, it } from 'vitest';
import { DocumentCipher } from './document-cipher.js';

const secret = 'a-test-secret-that-is-long-enough-123';
const photo = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

describe('DocumentCipher', () => {
  const cipher = new DocumentCipher(secret, 'test');

  it('round-trips a document stored at the same key', () => {
    const sealed = cipher.encrypt(photo, 'kyc/u1/a.jpg.enc');
    expect(Buffer.from(sealed).includes(Buffer.from(photo))).toBe(false);
    expect(cipher.decrypt(sealed, 'kyc/u1/a.jpg.enc')).toEqual(
      Buffer.from(photo),
    );
  });

  it('uses a fresh IV each time', () => {
    const a = cipher.encrypt(photo, 'k');
    const b = cipher.encrypt(photo, 'k');
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it('refuses a document moved to another key', () => {
    const sealed = cipher.encrypt(photo, 'kyc/u1/a.jpg.enc');
    expect(() => cipher.decrypt(sealed, 'kyc/u2/a.jpg.enc')).toThrow();
  });

  it('refuses altered bytes', () => {
    const sealed = Buffer.from(cipher.encrypt(photo, 'k'));
    sealed[sealed.length - 1]! ^= 1;
    expect(() => cipher.decrypt(sealed, 'k')).toThrow();
  });

  it('refuses another key or label', () => {
    const sealed = cipher.encrypt(photo, 'k');
    expect(() =>
      new DocumentCipher(secret, 'other').decrypt(sealed, 'k'),
    ).toThrow();
    expect(() =>
      new DocumentCipher(`${secret}x`, 'test').decrypt(sealed, 'k'),
    ).toThrow();
  });

  it('refuses unknown formats', () => {
    expect(() => cipher.decrypt(new Uint8Array([2, 1, 2]), 'k')).toThrow(
      'Unrecognised document format',
    );
  });
});
