/**
 * The path prefix the application is served under.
 *
 * The deployment mounts this app at `/awsmepplt` behind a shared nginx, and
 * Next is told about that with `basePath`. Next rewrites its own navigation -
 * `<Link>`, the router, `next/image`, the build assets - but it does **not**
 * touch a hand-written `fetch('/api/...')` or `new EventSource('/api/...')`.
 * Those would hit the origin root, miss the proxy location entirely, and come
 * back as the edge's 404.
 *
 * So every hand-written request to our own API goes through `apiPath()`.
 *
 * `NEXT_PUBLIC_BASE_PATH` is inlined at build time, and is empty in local
 * development, where the app is served from the root.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

/**
 * Prefix an absolute in-app path with the deployment's base path.
 *
 * Only for URLs the browser uses directly - `fetch`, `EventSource`, an
 * `<a href>`, a `signOut` callback. Never for a value handed to the Next
 * router or `<Link>`, which apply the base path themselves and would end up
 * with it twice.
 */
export function withBasePath(path: string): string {
  if (!BASE_PATH) return path
  return `${BASE_PATH}${path.startsWith('/') ? path : `/${path}`}`
}

/** Alias of {@link withBasePath}, read more naturally at API call sites. */
export const apiPath = withBasePath
