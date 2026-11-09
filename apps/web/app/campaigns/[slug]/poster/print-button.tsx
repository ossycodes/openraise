'use client';
import { Printer } from 'lucide-react';

export function PrintButton() {
  return (
    <button
      type="button"
      className="primary-button"
      onClick={() => window.print()}
    >
      <Printer size={17} aria-hidden="true" /> Print poster
    </button>
  );
}
