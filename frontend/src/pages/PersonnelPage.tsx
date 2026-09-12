import { AnimatePresence, motion } from "motion/react";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { RankBadge } from "@/components/rank/RankBadge";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { ForensicIcon } from "@/components/ui/ForensicIcon";
import { Panel } from "@/components/ui/Panel";
import { ScanLoader } from "@/components/ui/ScanLoader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatTile } from "@/components/ui/StatTile";
import { TiltCard } from "@/components/ui/TiltCard";
import { useAuth } from "@/context/AuthContext";
import { ApiError } from "@/lib/apiClient";
import * as userApi from "@/services/userApi";
import { canManageAccounts, type PoliceRank, type RankOption, type User, type UserRole } from "@/types";

const ROLES: Array<{ value: UserRole; label: string; hint: string }> = [
  { value: "investigating_officer", label: "Investigating Officer", hint: "Works the case: logs evidence, confirms findings." },
  { value: "supervisor", label: "Supervisor", hint: "Oversees cases and personnel." },
  { value: "forensic_reviewer", label: "Forensic Reviewer", hint: "Reviews autopsy and forensic hypotheses." },
  { value: "legal_reviewer", label: "Legal Reviewer", hint: "Pre-filing review; usually paired with view-only." },
];

const EMPTY_FORM = { full_name: "", badge_number: "", email: "", password: "", role: "investigating_officer" as UserRole, rank: "" as PoliceRank | "", station: "", is_view_only: false };

const BANDS: Array<{ min: number; label: string; color: string; can: string }> = [
  { min: 100, label: "Command", color: "#ffb547", can: "Sees every case. Provisions Superintendents and below. Drives the demo, anchors the ledger." },
  { min: 70, label: "Senior", color: "#f9a8d4", can: "Sees every case. Provisions Inspectors and below. Anchors the ledger." },
  { min: 50, label: "Supervisory", color: "#c4b5fd", can: "Own cases. Confirms AI output, reads the audit trail; DSP+ provisions accounts." },
  { min: 40, label: "Investigating", color: "#06ffa5", can: "Own cases. Confirms AI findings, views PII." },
  { min: 0, label: "Field", color: "#b9b0d6", can: "Own cases. Logs evidence — with a live capture — and reads at their clearance." },
];
const bandOf = (s: number) => BANDS.find((b) => s >= b.min) ?? BANDS[BANDS.length - 1];

function genPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
  const a = new Uint32Array(14);
  crypto.getRandomValues(a);
  return Array.from(a, (n) => chars[n % chars.length]).join("");
}

/**
 * Personnel & Access — the chain of command as a roster. Accounts are
 * provisioned strictly top-down (a Commissioner creates an SP, an SP creates
 * an Inspector); the rank list comes from the server so the form can only
 * offer what the server will accept. Deactivation never deletes anyone —
 * their audit history has to survive.
 */
export function PersonnelPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [ranks, setRanks] = useState<RankOption[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const mayManage = canManageAccounts(user);

  function reload() {
    return userApi
      .listUsers()
      .then(setUsers)
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    void reload();
    userApi.listProvisionableRanks().then(setRanks).catch(() => setRanks([]));
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!form.rank) {
      setError("Select a rank for the new account.");
      return;
    }
    setSubmitting(true);
    try {
      const created = await userApi.provisionAccount({ ...form, rank: form.rank, station: form.station || null });
      setNotice(`Account created for ${created.full_name} (${created.rank_abbreviation}). Temporary password: ${form.password} — hand it over in person; it is not shown again.`);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail) : "Could not create the account.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeactivate(target: User) {
    if (!window.confirm(`Deactivate ${target.full_name}? Their audit history is kept; they can no longer sign in.`)) return;
    setError(null);
    setNotice(null);
    try {
      await userApi.deactivateAccount(target.id);
      setNotice(`${target.full_name} has been deactivated. Their audit history is retained.`);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? String(err.detail) : "Could not deactivate that account.");
    }
  }

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...users].filter((u) => !q || `${u.full_name} ${u.badge_number} ${u.station ?? ""} ${u.rank} ${u.role}`.toLowerCase().includes(q)).sort((a, b) => b.seniority - a.seniority || a.full_name.localeCompare(b.full_name));
  }, [users, query]);
  const grouped = useMemo(() => {
    const m = new Map<string, User[]>();
    sorted.forEach((u) => {
      const b = bandOf(u.seniority).label;
      m.set(b, [...(m.get(b) ?? []), u]);
    });
    return BANDS.map((b) => ({ band: b, members: m.get(b.label) ?? [] })).filter((g) => g.members.length > 0);
  }, [sorted]);
  const active = users.filter((u) => u.is_active).length;
  const viewOnly = users.filter((u) => u.is_view_only).length;
  const stations = new Set(users.map((u) => u.station ?? "")).size;

  return (
    <AppShell>
      <SectionHeader
        eyebrow="Authority · rank + role, provisioned top-down"
        title="Personnel & access"
        description="Every officer sees and does exactly what their rank and role allow — a Constable logs evidence with a live capture, an Inspector confirms AI findings, a Superintendent sees every case. Accounts are created only for ranks below your own; deactivation keeps the audit history."
        actions={
          mayManage ? (
            <Button variant="primary" size="sm" onClick={() => setShowForm((v) => !v)} icon={<ForensicIcon name={showForm ? "arrow" : "plus"} size={13} />}>
              {showForm ? "Cancel" : "Provision account"}
            </Button>
          ) : undefined
        }
      />

      {notice && (
        <p role="status" className="hud-frame hud-frame--ok mb-4 px-4 py-3 text-sm text-cot-mint">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="hud-frame hud-frame--crit mb-4 px-4 py-3 text-sm text-cot-red">
          {error}
        </p>
      )}

      <div className="rise mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile label="Officers" value={users.length} tone="violet" icon={<ForensicIcon name="shield" size={16} />} hint={mayManage ? "Visible to your rank" : "Your own record"} />
        <StatTile label="Active" value={active} tone="mint" progress={users.length ? active / users.length : 0} icon={<ForensicIcon name="check" size={16} />} hint="Can sign in" />
        <StatTile label="View-only" value={viewOnly} tone="magenta" icon={<ForensicIcon name="audit" size={16} />} hint="Oversight accounts — read, never write" />
        <StatTile label="Stations / units" value={stations} tone="ice" icon={<ForensicIcon name="map" size={16} />} hint="Represented on the roster" />
      </div>

      <AnimatePresence initial={false}>
        {showForm && mayManage && (
          <motion.div key="provision" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-5 overflow-hidden">
            <Panel eyebrow="Provision" title="Create an account for a rank below yours" tone="warn" busy={submitting}>
              <form onSubmit={handleSubmit}>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <Field label="Full name" required value={form.full_name} onChange={(v) => setForm({ ...form, full_name: v })} />
                  <Field label="Badge number" required value={form.badge_number} onChange={(v) => setForm({ ...form, badge_number: v })} />
                  <Field label="Service email" type="email" required value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
                  <label className="block">
                    <span className="field-label">Temporary password</span>
                    <div className="flex gap-2">
                      <input type="text" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full font-mono" />
                      <Button type="button" size="sm" onClick={() => setForm({ ...form, password: genPassword() })}>
                        Generate
                      </Button>
                    </div>
                    <span className="mt-1 block text-[11.5px] text-cot-text3">Minimum 8 characters. Hand it over in person; the officer changes it on first sign-in.</span>
                  </label>
                  <Field label="Station / unit" value={form.station} onChange={(v) => setForm({ ...form, station: v })} />
                  <label className="block">
                    <span className="field-label">Rank</span>
                    <select required value={form.rank} onChange={(e) => setForm({ ...form, rank: e.target.value as PoliceRank })} className="w-full">
                      <option value="">Select a rank…</option>
                      {ranks.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.abbreviation} — {r.label}
                        </option>
                      ))}
                    </select>
                    <span className="mt-1 block text-[11.5px] text-cot-text3">Only ranks below yours are offered — the server enforces the same rule.</span>
                  </label>
                  <label className="block">
                    <span className="field-label">Function</span>
                    <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })} className="w-full">
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                    <span className="mt-1 block text-[11.5px] text-cot-text3">{ROLES.find((r) => r.value === form.role)?.hint}</span>
                  </label>
                  <label className="flex items-start gap-3 rounded-xl border border-[color:var(--cot-line)] bg-white/[.02] p-3 md:col-span-2 xl:col-span-1">
                    <input type="checkbox" checked={form.is_view_only} onChange={(e) => setForm({ ...form, is_view_only: e.target.checked })} className="mt-1 h-4 w-4 accent-[#f472b6]" />
                    <span className="text-[13px]">
                      <span className="font-semibold text-white">View-only oversight account</span>
                      <span className="mt-0.5 block text-[11.5px] text-cot-text3">Reads the record at their rank's clearance; cannot log, confirm or alter anything. Typical for a prosecutor or an auditor.</span>
                    </span>
                  </label>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button type="submit" variant="primary" busy={submitting} icon={<ForensicIcon name="plus" size={13} />}>
                    Create account
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </Panel>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {loading ? (
            <ScanLoader label="Reading the roster…" rows={5} />
          ) : (
            <>
              <label className="relative mb-4 flex max-w-md items-center">
                <ForensicIcon name="search" size={14} className="pointer-events-none absolute left-3 text-cot-text3" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find an officer, badge, station…" className="w-full !pl-9 !py-2 !text-[14px]" aria-label="Filter roster" />
              </label>
              <div className="space-y-6">
                {grouped.map(({ band, members }) => (
                  <section key={band.label}>
                    <div className="mb-2 flex items-center gap-3">
                      <span className="label-caps" style={{ color: band.color }}>{band.label}</span>
                      <span className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${band.color}66, transparent)` }} />
                      <span className="font-mono text-[11px] text-cot-text3">{members.length}</span>
                    </div>
                    <div className="rise grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                      {members.map((row) => {
                        const initials = row.full_name.replace(/^(Dr\.|Adv\.)\s*/, "").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
                        const canDeactivate = mayManage && row.is_active && user && row.seniority < user.seniority && row.id !== user.id;
                        return (
                          <TiltCard key={row.id} className={`hud-frame p-4 ${!row.is_active ? "opacity-60" : ""}`} glare>
                            <div className="flex items-start gap-3">
                              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[13px] font-bold text-[#140a2e]" style={{ background: `linear-gradient(135deg, ${band.color}, #f472b6)`, boxShadow: `0 0 18px ${band.color}55` }}>{initials}</span>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-[14.5px] font-bold text-white">{row.full_name}</div>
                                <div className="font-mono text-[11px] text-cot-text3">{row.badge_number} · {row.email}</div>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <RankBadge user={row} />
                                  <span className="text-[12px] capitalize text-cot-text2">{row.role.replace(/_/g, " ")}</span>
                                </div>
                              </div>
                            </div>
                            <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/[.06] pt-2.5 text-[12px] text-cot-text3">
                              <span className="flex items-center gap-1.5"><ForensicIcon name="map" size={12} /> {row.station ?? "Unassigned"}</span>
                              {!row.is_active ? <Chip tone="critical">Deactivated</Chip> : row.is_view_only ? <Chip tone="ai">View only</Chip> : <Chip tone="ok" dot>Active</Chip>}
                            </div>
                            {canDeactivate && (
                              <div className="mt-2.5">
                                <Button size="sm" variant="danger" onClick={() => void handleDeactivate(row)}>
                                  Deactivate
                                </Button>
                              </div>
                            )}
                          </TiltCard>
                        );
                      })}
                    </div>
                  </section>
                ))}
                {grouped.length === 0 && <p className="py-6 text-center text-sm text-cot-text3">No officer matches.</p>}
              </div>
            </>
          )}
        </div>

        <div className="space-y-4">
          <Panel eyebrow="Chain of command" title="Who can do what">
            <ol className="space-y-2">
              {BANDS.map((b, i) => (
                <li key={b.label} className="rounded-xl border border-[color:var(--cot-line)] bg-white/[.02] p-3">
                  <div className="flex items-center gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded-full font-mono text-[10px] text-[#140a2e]" style={{ background: b.color }}>{i + 1}</span>
                    <span className="label-caps" style={{ color: b.color }}>{b.label}</span>
                  </div>
                  <p className="mt-1.5 text-[12.5px] text-cot-text2">{b.can}</p>
                </li>
              ))}
            </ol>
          </Panel>
          {!mayManage && (
            <Panel eyebrow="Your access" title="Read-only roster" tone="warn">
              <p className="text-[13px] text-cot-text2">Account management needs Deputy Superintendent rank or above. Your own record is shown; provisioning and deactivation are not available at your rank.</p>
            </Panel>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Field({ label, value, onChange, type = "text", required = false, minLength }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; minLength?: number }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input type={type} required={required} minLength={minLength} value={value} onChange={(e) => onChange(e.target.value)} className="w-full" />
    </label>
  );
}
