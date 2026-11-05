import { sniffImageType } from './image-type.js';

const bytes = (...b: number[]) => Uint8Array.from(b);

describe('sniffImageType', () => {
  it('recognises JPEG, PNG and WebP by their signatures', () => {
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10))).toBe('image/jpeg');
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe('image/png');
    const webp = new TextEncoder().encode('RIFF\x24\x00\x00\x00WEBPVP8 ');
    expect(sniffImageType(webp)).toBe('image/webp');
  });

  it('rejects everything else, whatever it claims to be', () => {
    expect(sniffImageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode('%PDF-1.7'))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode('GIF89a'))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode('RIFF\x24\x00\x00\x00WAVEfmt '))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
});
