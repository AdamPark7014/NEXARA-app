/**
 * Cómo se lee un folio de cotización (nomenclatura de seguimiento).
 *
 *   NEX-LJ75100126-0007-JA.CE-R2
 *   │   │          │    │     └─ revisión enviada (la 1 no se escribe)
 *   │   │          │    └─ siglas de quienes intervinieron además de quien la hizo, en orden
 *   │   │          └─ consecutivo de esa persona: su cotización #7
 *   │   └─ nomenclatura de RH de quien la hizo (2 iniciales + 8 dígitos; ceros donde falta el dato)
 *   └─ NEXARA
 *
 * El servidor arma el folio (`apps/api/src/cotizaciones/folio-core.ts`); la web solo lo explica.
 */

export type PartesFolio = {
  /** `NEX-LJ75100126-0007`. */
  base: string;
  nomenclatura: string;
  siglas: string;
  consecutivo: number;
  /** Siglas de la cadena (`["JA", "CE"]`). */
  cadena: string[];
  /** 1 si el folio no trae `-R`. */
  revision: number;
  /** La clave de RH está completa (no es un relleno con ceros). */
  claveCompleta: boolean;
};

const FOLIO = /^NEX-([A-Z]{2}\d{8})-(\d{4,})(?:-([A-Z]{2}(?:\.[A-Z]{2})*))?(?:-R(\d+))?$/;

/** Separa el folio en sus piezas. `null` si no sigue la nomenclatura (folios viejos `NXR-2026-…`). */
export function partesDelFolio(folio: string | null | undefined): PartesFolio | null {
  const limpio = String(folio ?? "").trim().toUpperCase();
  const m = limpio.match(FOLIO);
  if (!m) return null;
  const nomenclatura = m[1]!;
  return {
    base: `NEX-${nomenclatura}-${m[2]}`,
    nomenclatura,
    siglas: nomenclatura.slice(0, 2),
    consecutivo: Number(m[2]),
    cadena: m[3] ? m[3].split(".") : [],
    revision: m[4] ? Number(m[4]) : 1,
    claveCompleta: !/0{8}$/.test(nomenclatura),
  };
}

export type PersonaFolio = { nombre?: string | null; siglas?: string | null; clave?: string | null };

export type PiezaFolio = {
  texto: string;
  /** Qué significa, en palabras («su cotización #7»). */
  significa: string;
  tipo: "prefijo" | "clave" | "consecutivo" | "cadena" | "revision";
};

export type FolioExplicado = {
  /** El folio sigue la nomenclatura. */
  conNomenclatura: boolean;
  piezas: PiezaFolio[];
  /** «Luis Joel Aguilar (LJ75100126) · su cotización #7 · intervinieron JA, CE · revisión 2». */
  resumen: string;
  /** Aviso cuando la clave de RH vino incompleta o el folio es de los viejos. */
  aviso: string | null;
};

function nombreDeSiglas(siglas: string, personas: PersonaFolio[]): string | null {
  const persona = personas.find((p) => (p.siglas || p.clave?.slice(0, 2) || "").toUpperCase() === siglas);
  return persona?.nombre?.trim() || null;
}

/**
 * El folio en palabras.
 *
 * `elaboro` pone nombre a la clave; `intervinieron` a las siglas de la cadena. Si la cotización
 * todavía no sale, `pendientes` son las siglas que se sumarán al enviarla (para enseñarlo antes).
 */
export function explicarFolio(
  folio: string | null | undefined,
  datos: {
    elaboro?: PersonaFolio | null;
    intervinieron?: PersonaFolio[];
    /** Revisión conocida por la API (manda sobre la del texto si es mayor). */
    revision?: number | null;
  } = {},
): FolioExplicado {
  const partes = partesDelFolio(folio);
  if (!partes) {
    return {
      conNomenclatura: false,
      piezas: [{ texto: String(folio ?? "—"), significa: "folio anterior a la nomenclatura", tipo: "prefijo" }],
      resumen: "Folio anterior a la nomenclatura: no dice de quién es ni quién intervino.",
      aviso: "Es un borrador de antes del folio con nomenclatura. Se le puede asignar uno con la clave de quien lo hizo.",
    };
  }

  const personas = [...(datos.intervinieron ?? []), ...(datos.elaboro ? [datos.elaboro] : [])];
  const autor = datos.elaboro?.nombre?.trim() || nombreDeSiglas(partes.siglas, personas);
  const revision = Math.max(partes.revision, Number(datos.revision ?? 0) || 0);

  const piezas: PiezaFolio[] = [
    { texto: "NEX", significa: "NEXARA", tipo: "prefijo" },
    {
      texto: partes.nomenclatura,
      significa: autor ? `${autor}` : `clave ${partes.nomenclatura}`,
      tipo: "clave",
    },
    { texto: String(partes.consecutivo).padStart(4, "0"), significa: `su cotización #${partes.consecutivo}`, tipo: "consecutivo" },
  ];
  if (partes.cadena.length) {
    piezas.push({
      texto: partes.cadena.join("."),
      significa: `intervinieron ${partes.cadena
        .map((s) => {
          const nombre = nombreDeSiglas(s, personas);
          return nombre ? `${s} (${nombre})` : s;
        })
        .join(", ")}`,
      tipo: "cadena",
    });
  }
  if (revision > 1) piezas.push({ texto: `R${revision}`, significa: `revisión ${revision}`, tipo: "revision" });

  const resumen = [
    autor ? `${autor} (${partes.nomenclatura})` : `Clave ${partes.nomenclatura}`,
    `su cotización #${partes.consecutivo}`,
    partes.cadena.length ? `intervinieron ${partes.cadena.join(", ")}` : null,
    revision > 1 ? `revisión ${revision}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    conNomenclatura: true,
    piezas,
    resumen,
    aviso: partes.claveCompleta
      ? null
      : "La clave de RH de esta persona está incompleta: lleva ceros donde falta el dato. El folio no cambia cuando RH la complete.",
  };
}

/**
 * Siglas que se agregarán al folio al enviar: quienes ya intervinieron (sin quien la hizo) y quien
 * envía, en orden y sin repetir. Es la misma regla que `cadenaParticipantes` en la API.
 */
export function cadenaAlEnviar(
  siglasAutor: string | null | undefined,
  participantes: Array<string | null | undefined>,
): string[] {
  const autor = String(siglasAutor ?? "").slice(0, 2).toUpperCase();
  const vistas = new Set<string>();
  const cadena: string[] = [];
  for (const raw of participantes) {
    const s = String(raw ?? "").trim().slice(0, 2).toUpperCase();
    if (s.length !== 2 || s === autor || vistas.has(s)) continue;
    vistas.add(s);
    cadena.push(s);
  }
  return cadena;
}

/** Folio con el que saldría si se envía ahora (aproximado: la API tiene la última palabra). */
export function folioAlEnviar(input: {
  folio: string;
  siglasAutor?: string | null;
  participantes: Array<string | null | undefined>;
  yaEnviada: boolean;
  revision?: number | null;
}): string {
  const partes = partesDelFolio(input.folio);
  if (!partes) return input.folio;
  const cadena = cadenaAlEnviar(input.siglasAutor ?? partes.siglas, input.participantes);
  const revision = input.yaEnviada ? Math.max(1, Number(input.revision ?? 1)) + 1 : 1;
  return partes.base + (cadena.length ? `-${cadena.join(".")}` : "") + (revision > 1 ? `-R${revision}` : "");
}
