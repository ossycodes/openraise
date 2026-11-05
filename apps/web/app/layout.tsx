import type { Metadata, Viewport } from 'next';
import type { CSSProperties, ReactNode } from 'react';
import { getSite } from './_lib/site';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite();
  return {
    metadataBase: new URL(process.env.WEB_URL ?? 'http://localhost:3000'),
    title: { default: site.name, template: `%s | ${site.name}` },
    applicationName: site.name,
    description: 'Open-source crowdfunding for African communities.',
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const site = await getSite();
  // A deployment's primary colour replaces the accent everywhere it's used.
  const style = site.primaryColor
    ? ({ '--accent': site.primaryColor, '--accent-hover': site.primaryColor } as CSSProperties)
    : undefined;
  return (
    <html lang="en">
      <body style={style}>{children}</body>
    </html>
  );
}
