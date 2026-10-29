import type { ReactNode } from "react";

type Props = {
  currentPage: "store" | "lab";
  children: ReactNode;
};

const links = [
  { page: "lab", label: "ScaleLab", href: "/" },
  { page: "store", label: "Demo Store", href: "/store" },
] as const;

export function AppShell({ currentPage, children }: Props) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-5 sm:px-8">
          <a href="/" className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-950 text-xs font-bold text-white">SL</span>
            <span>
              <span className="block text-sm font-semibold text-slate-950">ScaleLab</span>
              <span className="hidden text-xs text-slate-500 sm:block">Distributed systems laboratory</span>
            </span>
          </a>
          <nav aria-label="Primary navigation" className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-1">
            {links.map((link) => (
              <a
                key={link.page}
                href={link.href}
                aria-current={currentPage === link.page ? "page" : undefined}
                className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
                  currentPage === link.page ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
