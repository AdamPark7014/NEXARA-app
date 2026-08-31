/**
 * Parsea 400 de cierre de actividad con `missingEvidence[]`.
 */

export type ApiErrorWithEvidence = Error & {
  missingEvidence?: string[];
  status?: number;
};

export function parseApiErrorWithEvidence(raw: string, status?: number): ApiErrorWithEvidence {
  let parsed: { message?: string; missingEvidence?: string[]; error?: string } | null = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    /* texto plano */
  }
  const err = new Error(parsed?.message || parsed?.error || raw) as ApiErrorWithEvidence;
  err.missingEvidence = Array.isArray(parsed?.missingEvidence) ? parsed.missingEvidence : undefined;
  err.status = status;
  return err;
}

export function getMissingEvidence(e: unknown): string[] | null {
  const missing = (e as ApiErrorWithEvidence)?.missingEvidence;
  return Array.isArray(missing) && missing.length > 0 ? missing : null;
}
