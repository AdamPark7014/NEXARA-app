import { buildApiUrl } from "./api-base";
import { triggerBlobDownload } from "./file-download";

async function parseError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  return text || `HTTP ${res.status}`;
}

export async function downloadActivitiesReportPdf(
  token: string,
  filters: { from?: string; to?: string } = {},
) {
  const qs = new URLSearchParams();
  if (filters.from) qs.set("from", filters.from);
  if (filters.to) qs.set("to", filters.to);
  const res = await fetch(buildApiUrl(`activities/report.pdf?${qs}`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await parseError(res));
  const blob = await res.blob();
  await triggerBlobDownload(blob, `actividades-${filters.from || "inicio"}-${filters.to || "hoy"}.pdf`, {
    mimeType: "application/pdf",
  });
}
