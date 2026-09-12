import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { Wordmark } from "@/components/brand/Wordmark";
import { useAuth } from "@/context/AuthContext";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="grid-overlay flex h-screen flex-col items-center justify-center gap-4 bg-background">
        <Wordmark size={44} className="animate-pulse" />
        <p className="font-mono text-sm text-on-surface-variant">Verifying session…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Remember where they were headed so sign-in can return them there
    // instead of always dumping them on the dashboard.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
