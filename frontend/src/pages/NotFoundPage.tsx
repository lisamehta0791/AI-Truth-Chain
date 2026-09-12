import { Link } from "react-router-dom";

import { Wordmark } from "@/components/brand/Wordmark";

export function NotFoundPage() {
  return (
    <div className="grid-overlay flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-gutter text-center">
      <Wordmark size={56} />
      <p className="label-caps text-[color:var(--cot-amber)]">404 — No such record</p>
      <h1 className="text-2xl font-semibold text-on-surface">That page isn&apos;t part of the case file.</h1>
      <p className="max-w-md text-sm text-on-surface-variant">
        The address you followed doesn&apos;t match any screen in this system. If you reached it from a
        link inside the app, that link is stale.
      </p>
      <div className="flex gap-3">
        <Link
          to="/dashboard"
          className="rounded bg-primary-container px-5 py-2.5 text-sm font-semibold text-on-primary transition-transform hover:scale-[1.03]"
        >
          Back to Command Center
        </Link>
        <Link
          to="/"
          className="rounded border border-primary-container/50 px-5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary-container/10"
        >
          Home
        </Link>
      </div>
    </div>
  );
}
