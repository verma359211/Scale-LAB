import { useState, type ReactNode } from "react";

export function DetailSection({ id, title, description, children }: { id: string; title: string; description: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <details id={id} className="detail-section" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary><span><strong>{title}</strong><span>{description}</span></span><span className="disclosure-mark" aria-hidden="true">+</span></summary>
    {open && <div className="detail-content">{children}</div>}
  </details>;
}
