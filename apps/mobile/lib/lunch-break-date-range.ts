/**
 * Añade startDate/endDate en ISO (UTC medianoche del día elegido) para evitar el bug de
 * `new Date("YYYY-MM-DD")` + getDate() en zona local (día incorrecto en MX y similares).
 */
export function appendLunchBreakDayRangeQuery(endpoint: string, dateYmd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateYmd.trim());
  if (!m) return endpoint;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const startDate = new Date(Date.UTC(y, mo, d, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(y, mo, d + 1, 0, 0, 0, 0));
  const sep = endpoint.includes("?") ? "&" : "?";
  return `${endpoint}${sep}startDate=${encodeURIComponent(startDate.toISOString())}&endDate=${encodeURIComponent(endDate.toISOString())}`;
}
