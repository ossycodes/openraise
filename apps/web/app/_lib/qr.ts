import 'server-only';
import QRCode, { type QRCodeToBufferOptions, type QRCodeToStringOptions } from 'qrcode';
import { webOrigin } from './campaign-server';

/** The short link printed under a QR code, e.g. https://example.org/c/k7m2q */
export const shortUrl = (code: string) =>
  `${webOrigin().replace(/\/$/, '')}/c/${code}`;

/** What people type when they can't scan: the address without the scheme. */
export const shortLabel = (code: string) =>
  shortUrl(code).replace(/^https?:\/\//, '');

// Near-black on white with a quiet zone and medium error correction: reliable
// on cheap phone cameras and on posters printed in black and white.
const colors = { dark: '#14251bff', light: '#ffffffff' };

export function qrSvg(url: string): Promise<string> {
  const options: QRCodeToStringOptions = {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 2,
    color: colors,
  };
  return QRCode.toString(url, options);
}

export function qrPng(url: string): Promise<Buffer> {
  const options: QRCodeToBufferOptions = {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 1200,
    color: colors,
  };
  return QRCode.toBuffer(url, options);
}
