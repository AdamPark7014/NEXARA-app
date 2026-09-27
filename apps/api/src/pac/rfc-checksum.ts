/**
 * Dígito verificador del RFC según el algoritmo del SAT.
 *
 * Diccionario completo (`&`, espacio y `Ñ` incluidos: sin ellos todas las letras posteriores a la
 * N quedan corridas y se rechazan RFC válidos). Las personas morales (12 posiciones) se rellenan
 * con un espacio al inicio, así que ambos tipos pesan 13…2.
 *
 * Módulo puro: lo usan `SatService` y el reporte de preparación del PAC.
 */
const VALOR_RFC: Record<string, number> = (() => {
  const t: Record<string, number> = {};
  '0123456789'.split('').forEach((c, i) => (t[c] = i));
  'ABCDEFGHIJKLMN'.split('').forEach((c, i) => (t[c] = 10 + i));
  t['&'] = 24;
  'OPQRSTUVWXYZ'.split('').forEach((c, i) => (t[c] = 25 + i));
  t[' '] = 37;
  t['Ñ'] = 38;
  return t;
})();

export function digitoRfcCorrecto(rfc: string): boolean {
  let base = rfc.slice(0, -1);
  const digito = rfc.slice(-1);
  if (base.length === 11) base = ` ${base}`;
  if (base.length !== 12) return false;
  let suma = 0;
  for (let i = 0; i < 12; i += 1) {
    const v = VALOR_RFC[base[i]];
    if (v === undefined) return false;
    suma += v * (13 - i);
  }
  const dv = 11 - (suma % 11);
  const esperado = dv === 11 ? '0' : dv === 10 ? 'A' : String(dv);
  return esperado === digito;
}
