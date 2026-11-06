import type { Metadata } from 'next';
import { UnsubscribeForm } from './unsubscribe-form';
export const metadata: Metadata = {
  title: 'Unsubscribe from campaign updates',
  robots: { index: false },
  referrer: 'no-referrer',
};
export default function Page() {
  return <UnsubscribeForm />;
}
