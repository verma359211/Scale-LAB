import { AppShell } from "./components/AppShell";
import { ScaleLabPage } from "./pages/ScaleLabPage";
import { StorePage } from "./pages/StorePage";
import { resolvePage } from "./lib/routes";

export default function App() {
  const page = resolvePage(window.location.pathname);
  return (
    <AppShell currentPage={page}>
      {page === "lab" ? <ScaleLabPage /> : <StorePage />}
    </AppShell>
  );
}
