import { BrowserRouter } from "react-router-dom";

import { StorageNotice } from "@/components/layout/StorageNotice";
import { AuthProvider } from "@/context/AuthContext";
import { AppRouter } from "@/router";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRouter />
        <StorageNotice />
      </AuthProvider>
    </BrowserRouter>
  );
}
