import { Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { AuditTrailPage } from "@/pages/AuditTrailPage";
import { AutopsyPage } from "@/pages/AutopsyPage";
import { CaseClosureReadinessPage } from "@/pages/CaseClosureReadinessPage";
import { CaseCommandCenterPage } from "@/pages/CaseCommandCenterPage";
import { CaseSimilarityPage } from "@/pages/CaseSimilarityPage";
import { ChainOfCustodyPage } from "@/pages/ChainOfCustodyPage";
import { ChargesheetQaPage } from "@/pages/ChargesheetQaPage";
import { ContradictionsPage } from "@/pages/ContradictionsPage";
import { EvidenceGraphPage } from "@/pages/EvidenceGraphPage";
import { EvidenceIngestionPage } from "@/pages/EvidenceIngestionPage";
import { GuidancePage } from "@/pages/GuidancePage";
import { HashLedgerPage } from "@/pages/HashLedgerPage";
import { LandingPage } from "@/pages/LandingPage";
import { LoginPage } from "@/pages/LoginPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { OfflineSyncPage } from "@/pages/OfflineSyncPage";
import { PersonnelPage } from "@/pages/PersonnelPage";
import { PredictiveLocationPage } from "@/pages/PredictiveLocationPage";
import { StatementReliabilityPage } from "@/pages/StatementReliabilityPage";
import { TimelinePage } from "@/pages/TimelinePage";

/**
 * "/" is the public landing page; the authenticated app lives under
 * /dashboard and below. Keeping the marketing surface and the case surface on
 * separate paths means an unauthenticated visitor gets a real front door
 * rather than an immediate redirect to a login form.
 */
const PROTECTED_ROUTES: Array<{ path: string; element: React.ReactNode }> = [
  { path: "/dashboard", element: <CaseCommandCenterPage /> },
  { path: "/evidence/ingest", element: <EvidenceIngestionPage /> },
  { path: "/evidence/graph", element: <EvidenceGraphPage /> },
  { path: "/chain-of-custody", element: <ChainOfCustodyPage /> },
  { path: "/timeline", element: <TimelinePage /> },
  { path: "/contradictions", element: <ContradictionsPage /> },
  { path: "/guidance", element: <GuidancePage /> },
  { path: "/audit", element: <AuditTrailPage /> },
  { path: "/location", element: <PredictiveLocationPage /> },
  { path: "/autopsy", element: <AutopsyPage /> },
  { path: "/chargesheet", element: <ChargesheetQaPage /> },
  { path: "/closure-score", element: <CaseClosureReadinessPage /> },
  { path: "/case-similarity", element: <CaseSimilarityPage /> },
  { path: "/statements", element: <StatementReliabilityPage /> },
  { path: "/offline-sync", element: <OfflineSyncPage /> },
  { path: "/personnel", element: <PersonnelPage /> },
  { path: "/ledger", element: <HashLedgerPage /> },
];

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />

      {PROTECTED_ROUTES.map(({ path, element }) => (
        <Route key={path} path={path} element={<ProtectedRoute>{element}</ProtectedRoute>} />
      ))}

      {/* Anything else inside the app shell, so a mistyped URL doesn't render blank. */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
