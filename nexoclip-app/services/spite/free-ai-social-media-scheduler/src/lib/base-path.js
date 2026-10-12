export function withBasePath(path, basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "") {
  const base = basePath.replace(/\/$/, "");
  if (!base || !path.startsWith("/") || path === base || path.startsWith(`${base}/`)) {
    return path;
  }
  return path === "/" ? base : `${base}${path}`;
}
