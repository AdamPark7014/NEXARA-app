/**
 * Parte un texto de partida en párrafo y viñetas.
 *
 * Una ficha de producto suele venir en una sola línea («…características: • A • B» o «- A - B»).
 * Al imprimir, cada viñeta es su propio bloque; lo que va antes de la primera se queda como párrafo.
 * El guion y el asterisco solo cuentan como viñeta si hay un espacio a cada lado (o al inicio de la
 * línea): «Wi-Fi» y «-20°C» no se parten.
 */

export type SegmentoLista = { tipo: "parrafo" | "vineta"; texto: string };

const MARCADOR = /[•●∙▪‣◦]|(?:^|\s)[-*](?=\s)/g;

export function segmentosLista(valor: string): SegmentoLista[] {
  const crudo = String(valor ?? "").replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ");
  const segmentos: SegmentoLista[] = [];
  for (const linea of crudo.split("\n")) {
    if (!linea.trim()) {
      if (segmentos.length) segmentos.push({ tipo: "parrafo", texto: "" });
      continue;
    }
    const cortes: Array<{ index: number; length: number }> = [];
    MARCADOR.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MARCADOR.exec(linea))) {
      cortes.push({ index: m.index, length: m[0].length });
      if (m.index === MARCADOR.lastIndex) MARCADOR.lastIndex += 1;
    }
    if (!cortes.length) {
      segmentos.push({ tipo: "parrafo", texto: linea.trim() });
      continue;
    }
    const antes = linea.slice(0, cortes[0]!.index).trim();
    if (antes) segmentos.push({ tipo: "parrafo", texto: antes });
    for (let i = 0; i < cortes.length; i += 1) {
      const desde = cortes[i]!.index + cortes[i]!.length;
      const hasta = i + 1 < cortes.length ? cortes[i + 1]!.index : linea.length;
      const texto = linea.slice(desde, hasta).trim();
      if (texto) segmentos.push({ tipo: "vineta", texto });
    }
  }
  while (segmentos.length && segmentos[segmentos.length - 1]!.tipo === "parrafo" && !segmentos[segmentos.length - 1]!.texto) {
    segmentos.pop();
  }
  return segmentos;
}

/** El mismo texto, con cada viñeta en su renglón. Lo usa el editor al pegar. */
export function normalizarLista(valor: string): string {
  const segmentos = segmentosLista(valor);
  if (!segmentos.length) return String(valor ?? "").replace(/\r\n?/g, "\n");
  return segmentos
    .map((s) => (s.tipo === "vineta" ? `• ${s.texto}` : s.texto))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

/** Verdadero si el pegado trae viñetas y conviene reacomodarlo. */
export function traeVineta(valor: string): boolean {
  return /[•●∙▪‣◦]|(?:^|\n)\s*[-*]\s|\s[-*]\s/.test(valor);
}
