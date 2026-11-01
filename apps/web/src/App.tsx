import { AppShell } from "./components/AppShell";
import { ScaleLabPage } from "./pages/ScaleLabPage";
import { StorePage } from "./pages/StorePage";
import { resolvePage } from "./lib/routes";
import { useState } from "react";
import type { ClusterSignal } from "./lib/live-signals";

export default function App() {
  const page = resolvePage(window.location.pathname);
  const [clusterStatus, setClusterStatus] = useState<ClusterSignal>("connecting");
  return (
    <AppShell currentPage={page} clusterStatus={clusterStatus}>
      {page === "lab" ? <ScaleLabPage onClusterStatusChange={setClusterStatus} /> : <StorePage />}
    </AppShell>
  );
}
