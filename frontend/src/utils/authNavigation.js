const authOnlyRoutes = new Set(["/login", "/signup", "/reset-password"]);

export function authDestination(from, fallback = "/dashboard") {
  const pathname = from && typeof from.pathname === "string" ? from.pathname : "";
  if (!pathname.startsWith("/") || pathname.startsWith("//") || pathname.startsWith("/\\") || authOnlyRoutes.has(pathname)) {
    return fallback;
  }

  const search = typeof from.search === "string" && from.search.startsWith("?") ? from.search : "";
  const hash = typeof from.hash === "string" && from.hash.startsWith("#") ? from.hash : "";
  return `${pathname}${search}${hash}`;
}
