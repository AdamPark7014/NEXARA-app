/**
 * Evalúa condiciones simples de auto-aprobación en pasos de workflow.
 * Formato: `clave operador número` — ej. `maxDiscountPercent<=18`, `amount<5000`
 */
export function matchesAutoApproveCondition(
  condition: string | null | undefined,
  context: Record<string, unknown>,
): boolean {
  const trimmed = String(condition ?? '').trim();
  if (!trimmed) return false;

  const match = trimmed.match(/^([a-zA-Z_][\w]*)\s*(<=|>=|<>|!=|==|<|>)\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return false;

  const key = match[1];
  const op = match[2];
  const right = Number(match[3]);
  const left = Number(context[key] ?? 0);
  if (Number.isNaN(right)) return false;

  switch (op) {
    case '<=':
      return left <= right;
    case '>=':
      return left >= right;
    case '<':
      return left < right;
    case '>':
      return left > right;
    case '==':
      return left === right;
    case '!=':
    case '<>':
      return left !== right;
    default:
      return false;
  }
}
