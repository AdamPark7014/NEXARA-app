/** Real `fetch` before any Nexara offline patch (evita recursión). */
let nativeRef: typeof fetch | null = null;

export function setNativeFetch(fn: typeof fetch): void {
  nativeRef = fn;
}

export function getNativeFetch(): typeof fetch {
  return nativeRef ?? globalThis.fetch.bind(globalThis);
}
