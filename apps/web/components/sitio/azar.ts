/**
 * Azar sembrado (mulberry32): la misma semilla da siempre la misma serie, así que los circuitos y el vuelo de los
 * fragmentos del logotipo salen iguales en el servidor, en el navegador y en cada visita.
 */
export function azar(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
