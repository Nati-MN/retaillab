"use client";

import { useEffect } from "react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div role="alert" className="mx-auto mt-16 max-w-md rounded-md border border-neg/40 bg-surface p-5 text-center">
      <h1 className="text-base">This view could not be loaded</h1>
      <p className="mt-1 text-xs text-ink-2">
        Nothing was changed. If the database is unreachable, check <code className="font-mono">DATABASE_URL</code> and try again.
      </p>
      {error.digest && <p className="mt-2 font-mono text-2xs text-ink-3">Reference: {error.digest}</p>}
      <button type="button" onClick={reset} className="btn-primary mt-4">Try again</button>
    </div>
  );
}
