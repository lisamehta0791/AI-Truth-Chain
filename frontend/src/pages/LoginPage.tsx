import { motion } from "motion/react";
import { type FormEvent, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import { Wordmark } from "@/components/brand/Wordmark";
import { EvidenceLattice3D } from "@/components/landing/EvidenceLattice3D";
import { Button } from "@/components/ui/Button";
import { ForensicIcon } from "@/components/ui/ForensicIcon";
import { useAuth } from "@/context/AuthContext";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { ApiError } from "@/lib/apiClient";

const DEMO_DOMAIN = "demo.chainoftruth.example";

/**
 * Seeded accounts, mirroring scripts/seed_demo_case.py. Listed so the
 * clearance differences are demonstrable in one click — signing in as the
 * Constable and then the Commissioner is the fastest way to show that rank
 * changes what the system exposes.
 */
const DEMO_ACCOUNTS = [
  { local: "rajesh.menon", rank: "CP", name: "Commissioner Rajesh Menon", note: "Sees every case · provisions SPs", color: "#ffb547" },
  { local: "vikram.nair", rank: "SP", name: "Supt. Vikram Nair", note: "Every case · provisions below SP · anchors the ledger", color: "#f9a8d4" },
  { local: "meera.iyer", rank: "DSP", name: "Dr. Meera Iyer", note: "Forensic reviewer · confirms post-mortem findings", color: "#c4b5fd" },
  { local: "lisa.mathew", rank: "INSP", name: "Inspector Lisa Mathew", note: "Officer of record · reads the audit trail", color: "#c4b5fd" },
  { local: "ananya.rao", rank: "SI", name: "Sub-Inspector Ananya Rao", note: "Confirms or dismisses AI findings", color: "#06ffa5" },
  { local: "arjun.pillai", rank: "PC", name: "Constable Arjun Pillai", note: "Field rank · live capture required to log evidence", color: "#b9b0d6" },
  { local: "sameer.kulkarni", rank: "PP", name: "Adv. Sameer Kulkarni", note: "View-only prosecutor · reads everything, changes nothing", color: "#f472b6" },
];
const DEMO_PASSWORD = "DemoPass!2026";

export function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const reduced = usePrefersReducedMotion();
  const redirectTo = (location.state as { from?: string } | null)?.from ?? "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(false);
  const [showDemo, setShowDemo] = useState(true);
  const [pendingLocal, setPendingLocal] = useState<string | null>(null);

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  async function submit(nextEmail: string, nextPassword: string) {
    setError(null);
    setSubmitting(true);
    try {
      await login(nextEmail, nextPassword, rememberDevice);
      navigate(redirectTo);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail) : "Could not reach the server. Is the backend running?");
    } finally {
      setSubmitting(false);
      setPendingLocal(null);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void submit(email, password);
  }

  function useDemoAccount(local: string) {
    const demoEmail = `${local}@${DEMO_DOMAIN}`;
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD);
    setPendingLocal(local);
    void submit(demoEmail, DEMO_PASSWORD);
  }

  const anim = (delay = 0) => (reduced ? {} : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] as const } });

  return (
    <div className="forensic-shell relative min-h-screen overflow-hidden bg-cot-bg">
      <EvidenceLattice3D className="pointer-events-none absolute inset-0 h-full w-full opacity-60" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_600px_at_20%_30%,rgba(124,58,237,.22),transparent_60%),radial-gradient(700px_500px_at_85%_70%,rgba(236,72,153,.14),transparent_60%)]" />

      <div className="relative mx-auto grid min-h-screen max-w-[1400px] items-center gap-10 px-5 py-10 lg:grid-cols-[minmax(0,1fr)_460px] lg:px-10">
        {/* left — the pitch */}
        <div className="hidden lg:block">
          <motion.div {...anim(0)}>
            <Link to="/" className="inline-flex items-center gap-3">
              <Wordmark size={48} className="drop-shadow-[0_0_14px_rgba(167,139,250,.7)]" />
              <span>
                <span className="display block text-[18px] text-white glow-text">CHAIN OF TRUTH</span>
                <span className="label-caps block text-cot-text3">Evidence · Intelligence · Justice</span>
              </span>
            </Link>
          </motion.div>
          <motion.h1 {...anim(0.1)} className="mt-10 max-w-xl text-[40px] leading-[1.05] text-white glow-text">
            The case file that reads itself — and answers to you.
          </motion.h1>
          <motion.p {...anim(0.18)} className="mt-5 max-w-lg text-[17px] leading-relaxed text-cot-text2">
            Sign in with your service credentials. What you can see and change is set by your rank and your role on the case, and every action you take is written to the audit trail.
          </motion.p>
          <motion.ul {...anim(0.26)} className="mt-8 grid max-w-lg gap-3">
            {[
              { icon: "lock" as const, t: "Hash-chained custody", d: "Every item sealed on arrival and anchored outside the database." },
              { icon: "brain" as const, t: "AI that cites its evidence", d: "Timeline, contradictions and post-mortem findings — every claim sourced, every one a hypothesis until an officer confirms it." },
              { icon: "shield" as const, t: "Rank-aware access", d: "Constable to Commissioner, each rank sees and does exactly what the law allows." },
            ].map((f) => (
              <li key={f.t} className="hud-frame flex items-start gap-3 p-3.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[color:var(--cot-line)] bg-[rgba(167,139,250,.08)] text-cot-violet">
                  <ForensicIcon name={f.icon} size={17} />
                </span>
                <span>
                  <span className="block text-[14.5px] font-bold text-white">{f.t}</span>
                  <span className="block text-[13px] text-cot-text2">{f.d}</span>
                </span>
              </li>
            ))}
          </motion.ul>
          <motion.p {...anim(0.34)} className="mt-6 max-w-lg text-[12.5px] text-cot-text3">
            AI output in this system is a suggestion, never a determination. Nothing becomes part of the verified case record until an officer confirms it.
          </motion.p>
        </div>

        {/* right — the form */}
        <motion.div {...anim(0.12)} className="hud-frame holo-border w-full p-6 sm:p-7">
          <div className="mb-5 flex items-center gap-3 lg:hidden">
            <Wordmark size={36} />
            <span className="display text-[15px] text-white">CHAIN OF TRUTH</span>
          </div>
          <span className="eyebrow text-cot-magenta">Officer sign-in</span>
          <h2 className="mt-1 text-[22px] text-white">Authorised personnel only</h2>
          <p className="mt-1 text-[13px] text-cot-text3">Access is logged. Your rank decides what you see.</p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <label className="block">
              <span className="field-label">Service email</span>
              <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full" placeholder="name@station.police.gov.in" />
            </label>
            <label className="block">
              <span className="field-label">Password</span>
              <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full" placeholder="••••••••••" />
            </label>
            <label className="flex items-start gap-3 text-[12.5px] text-cot-text2">
              <input type="checkbox" checked={rememberDevice} onChange={(e) => setRememberDevice(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#a78bfa]" />
              <span>
                <span className="font-semibold text-white">Remember this device.</span> Leave unticked on a shared station terminal — the session then ends when the tab closes.
              </span>
            </label>
            {error && (
              <p role="alert" className="rounded-lg border border-cot-red/40 bg-cot-red/10 px-3 py-2 text-[13px] text-cot-red">
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" size="lg" busy={submitting && !pendingLocal} className="w-full">
              Sign in
            </Button>
          </form>

          <div className="mt-6">
            <button type="button" onClick={() => setShowDemo((v) => !v)} className="flex w-full items-center justify-between rounded-lg border border-[color:var(--cot-line)] bg-white/[.02] px-3 py-2 text-left !overflow-visible" aria-expanded={showDemo}>
              <span className="label-caps text-cot-text2">Demonstration accounts — sign in by rank</span>
              <span className="text-cot-text3">{showDemo ? "▴" : "▾"}</span>
            </button>
            {showDemo && (
              <ul className="rise mt-2 grid gap-1.5 sm:grid-cols-2">
                {DEMO_ACCOUNTS.map((a) => (
                  <li key={a.local}>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => useDemoAccount(a.local)}
                      className="flex w-full items-start gap-2.5 rounded-lg border border-[color:var(--cot-line)] bg-white/[.02] px-2.5 py-2 text-left transition-colors hover:border-[color:var(--cot-line-strong)] hover:bg-[rgba(167,139,250,.08)] disabled:opacity-50 !overflow-visible"
                    >
                      <span className="label-caps mt-0.5 shrink-0 rounded border px-1.5 py-1" style={{ color: a.color, borderColor: `${a.color}66` }}>
                        {pendingLocal === a.local ? "…" : a.rank}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold text-white">{a.name}</span>
                        <span className="block text-[11px] leading-snug text-cot-text3">{a.note}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-cot-text4">All demo officers, cases and evidence are fictional. Password for every demo account: <span className="font-mono text-cot-text3">{DEMO_PASSWORD}</span></p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
