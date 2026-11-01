/**
 * Celda CSV entre comillas que Excel / Google Sheets no ejecuta como fórmula.
 *
 * Nombres de proveedor y RFC llegan de XML de facturas ajenas: un `=HYPERLINK(...)` o `@SUM(...)`
 * se ejecutaba al abrir la DIOT o la bitácora en Excel. Un texto que empieza con `=`, `+`, `-`, `@`,
 * tabulador o retorno lleva un apóstrofo delante; los números (también `-12.50`) quedan igual.
 */
export function celdaCsv(valor: unknown): string {
  if (valor === null || valor === undefined) return '""';
  if (typeof valor === 'number' || typeof valor === 'bigint') return String(valor);
  let txt = String(valor);
  if (/^[=+\-@\t\r]/.test(txt) && !/^-?\d+(\.\d+)?$/.test(txt)) txt = `'${txt}`;
  return `"${txt.replace(/"/g, '""')}"`;
}
