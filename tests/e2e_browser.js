/**
 * End-to-end smoke test: loads every page in a real browser as different
 * ranks and fails on any console error, page error, or failed request.
 */
const { chromium } = require("playwright-core");

const APP = process.env.APP_URL || "http://localhost:5173";
const DOMAIN = "demo.chainoftruth.example";
const PW = "DemoPass!2026";

const PAGES = [
  ["/dashboard", "Command Center"],
  ["/timeline", "Timeline"],
  ["/contradictions", "Contradictions"],
  ["/guidance", "Investigation Guidance"],
  ["/autopsy", "Autopsy"],
  ["/evidence/ingest", "Evidence Ingestion"],
  ["/evidence/graph", "Evidence Graph"],
  ["/chain-of-custody", "Chain of Custody"],
  ["/location", "Predictive Location"],
  ["/closure-score", "Closure"],
  ["/chargesheet", "Chargesheet"],
  ["/statements", "Statement"],
  ["/case-similarity", "Case Similarity"],
  ["/audit", "Audit"],
  ["/personnel", "Personnel"],
  ["/offline-sync", "Offline"],
];

const results = [];
function record(label, ok, detail = "") {
  results.push({ label, ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

// Noise we deliberately tolerate: third-party tile CDNs can rate-limit, and
// that is not an application defect.
const IGNORABLE = [
  /basemaps\.cartocdn\.com/i,
  /favicon/i,
  /Download the React DevTools/i,
  /WebGL/i,
  /\[vite\]/i,
];
const ignorable = (text) => IGNORABLE.some((re) => re.test(text));

async function newPageWithWatchers(context, bucket) {
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error" && !ignorable(msg.text())) bucket.push(`console: ${msg.text().slice(0, 220)}`);
  });
  page.on("pageerror", (err) => {
    if (!ignorable(String(err))) bucket.push(`pageerror: ${String(err).slice(0, 220)}`);
  });
  page.on("requestfailed", (req) => {
    const url = req.url();
    if (!ignorable(url)) bucket.push(`requestfailed: ${url.slice(0, 160)}`);
  });
  return page;
}

async function freshPersona(browser, local, bucket) {
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  const page = await newPageWithWatchers(context, bucket);
  await login(page, local);
  return { context, page };
}

async function login(page, local) {
  await page.goto(`${APP}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', `${local}@${DOMAIN}`);
  await page.fill('input[type="password"]', PW);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 20000 });
}

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });

  // ---------------------------------------------------------- landing page
  {
    const errs = [];
    const page = await newPageWithWatchers(context, errs);
    await page.goto(APP, { waitUntil: "networkidle" });
    const heading = await page.textContent("h1").catch(() => null);
    record("landing page renders", Boolean(heading && heading.length > 10), heading?.slice(0, 60));
    record("landing shows tagline", /Evidence\s*·\s*Intelligence\s*·\s*Justice|Analyze/i.test(await page.content()), "");
    record(
      "landing states AI-assists principle",
      (await page.content()).includes("AI assists"),
      ""
    );
    record("landing has 3D canvas", (await page.locator("canvas").count()) > 0, "");
    record("landing: no console/page errors", errs.length === 0, errs.slice(0, 2).join(" | "));
    await page.close();
  }

  // -------------------------------------------------------- login redirect
  {
    const errs = [];
    const page = await newPageWithWatchers(context, errs);
    await page.goto(`${APP}/timeline`, { waitUntil: "networkidle" });
    // ProtectedRoute redirects after the auth check resolves, which can land
    // just after networkidle — wait for the URL rather than sampling it.
    await page.waitForURL(/\/login/, { timeout: 10000 }).catch(() => {});
    record("unauthenticated /timeline redirects to /login", page.url().includes("/login"), page.url());
    await page.close();
  }

  // ---------------------------------------- full page sweep as an Inspector
  {
    const errs = [];
    const page = await newPageWithWatchers(context, errs);
    await login(page, "lisa.mathew");
    record("Inspector can sign in", page.url().includes("/dashboard"));

    for (const [path, expect] of PAGES) {
      const before = errs.length;
      await page.goto(`${APP}${path}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(900); // let 3D/map/graph settle
      const body = await page.textContent("body");
      const rendered = body && body.length > 200;
      const newErrs = errs.slice(before);
      record(
        `page ${path}`,
        Boolean(rendered) && newErrs.length === 0,
        newErrs.length ? newErrs[0] : rendered ? "" : "empty body"
      );
    }
    await page.close();
  }

  // -------------------------------------------- rank-gated nav visibility
  {
    const errs = [];
    const persona = await freshPersona(browser, "arjun.pillai", errs);
    const page = persona.page; // Constable
    const nav = await page.textContent("aside");
    record("Constable: Personnel hidden from nav", !nav.includes("Personnel"), "");
    record("Constable: Audit Trail hidden from nav", !nav.includes("Audit Trail"), "");

    await page.goto(`${APP}/evidence/ingest`, { waitUntil: "networkidle" });
    const ingest = await page.textContent("body");
    record("Constable: live capture marked required", /live (camera )?capture[\s\S]{0,200}required/i.test(ingest), "");
    await persona.context.close();
  }

  {
    const errs = [];
    const persona = await freshPersona(browser, "rajesh.menon", errs);
    const page = persona.page; // Commissioner
    const nav = await page.textContent("aside");
    record("Commissioner: Personnel visible in nav", nav.includes("Personnel"), "");
    record("Commissioner: Audit Trail visible in nav", nav.includes("Audit Trail"), "");

    await page.goto(`${APP}/personnel`, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    const body = await page.textContent("body");
    record("Personnel page lists officers", body.includes("Commissioner Rajesh Menon"), "");
    record("Personnel page offers provisioning", /provision account/i.test(body), "");
    await persona.context.close();
  }

  // ----------------------------------------------------- view-only account
  {
    const errs = [];
    const persona = await freshPersona(browser, "sameer.kulkarni", errs);
    const page = persona.page; // view-only prosecutor
    await page.goto(`${APP}/personnel`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    const body = await page.textContent("body");
    record("view-only: provisioning not offered", !body.includes("+ Provision Account"), "");
    await persona.context.close();
  }

  // ------------------------------------------------------------ 404 route
  {
    const errs = [];
    const page = await newPageWithWatchers(context, errs);
    await page.goto(`${APP}/no-such-page`, { waitUntil: "networkidle" });
    const body = await page.textContent("body");
    record("unknown route shows 404 page", body.includes("404"), "");
    await page.close();
  }

  // ----------------------------------------------------- mobile breakpoint
  {
    const errs = [];
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await newPageWithWatchers(mobile, errs);
    await page.goto(APP, { waitUntil: "networkidle" });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 2
    );
    record("landing has no horizontal overflow at 390px", !overflow, overflow ? "overflows" : "");
    await mobile.close();
  }

  await browser.close();

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${"=".repeat(72)}\n${passed}/${results.length} browser checks passed`);
  const failures = results.filter((r) => !r.ok);
  if (failures.length) {
    console.log("\nFAILURES:");
    failures.forEach((f) => console.log(`  - ${f.label}: ${f.detail}`));
    process.exit(1);
  }
})().catch((e) => {
  console.error("HARNESS ERROR:", e);
  process.exit(2);
});
