/** Cada consulta explícita evita el tope silencioso de 5,000 filas del middleware. */
export async function leerPaginasCostos<T>(leer: (skip: number) => Promise<T[]>): Promise<T[]> {
  const filas: T[] = [];
  for (let skip = 0; ; skip += 500) {
    const pagina = await leer(skip);
    filas.push(...pagina);
    if (pagina.length < 500) return filas;
  }
}
