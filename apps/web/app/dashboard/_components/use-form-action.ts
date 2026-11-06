'use client';

import { useActionState } from 'react';

/**
 * useActionState plus a counter that changes on every result. React resets a
 * form after its action runs, and a <select> resets to whatever it showed
 * when it mounted, not its new defaultValue. Keying the form on `version`
 * remounts it with the values the action sent back instead.
 */
export function useFormAction<S extends object>(
  action: (state: S, form: FormData) => Promise<S>,
  initial: S,
) {
  const [state, run, pending] = useActionState<S & { version?: number }, FormData>(
    async (prev, form) => ({
      ...(await action(prev, form)),
      version: (prev.version ?? 0) + 1,
    }),
    initial as Awaited<S & { version?: number }>,
  );
  return { state, run, pending, version: state.version ?? 0 };
}
