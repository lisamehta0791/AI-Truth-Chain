import { useState } from "react";

/**
 * The Chain of Truth mark.
 *
 * Renders the supplied logo bitmap from /logo.png when it is present, and
 * falls back to a self-contained inline SVG (scales/chain/fingerprint motif)
 * when it is not. The fallback exists so the app never shows a broken image
 * on a fresh clone where the asset has not been dropped in yet — the brand is
 * part of the product, not an optional extra.
 */
export function Wordmark({ size = 40, className = "" }: { size?: number; className?: string }) {
  const [bitmapFailed, setBitmapFailed] = useState(false);

  if (!bitmapFailed) {
    return (
      <img
        src="/logo.png"
        alt="Chain of Truth"
        width={size}
        height={size}
        className={`shrink-0 select-none object-contain ${className}`}
        onError={() => setBitmapFailed(true)}
      />
    );
  }

  return <MarkFallback size={size} className={className} />;
}

function MarkFallback({ size, className }: { size: number; className: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-label="Chain of Truth"
      className={`shrink-0 ${className}`}
    >
      <defs>
        <linearGradient id="cot-mark-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#be185d" />
        </linearGradient>
      </defs>
      {/* Shield */}
      <path
        d="M24 3.5 41 9.5v13c0 11-7.2 19.4-17 22.9C14.2 41.9 7 33.5 7 22.5v-13L24 3.5Z"
        stroke="url(#cot-mark-grad)"
        strokeWidth="2"
        fill="rgba(167,139,250,0.06)"
      />
      {/* Chain links — the "chain" of custody */}
      <rect x="14.5" y="21.5" width="9" height="6.5" rx="3.25" stroke="#a78bfa" strokeWidth="1.8" />
      <rect x="24.5" y="21.5" width="9" height="6.5" rx="3.25" stroke="#f9a8d4" strokeWidth="1.8" />
      {/* Balance beam — the judiciary half */}
      <path d="M24 11v7M17 14.5h14" stroke="#e9d5ff" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M31 33.5h-14" stroke="#06ffa5" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
