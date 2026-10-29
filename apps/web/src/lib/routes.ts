export function resolvePage(pathname: string): "lab" | "store" {
  const path = pathname.replace(/\/+$/, "") || "/";
  return path === "/store" ? "store" : "lab";
}
