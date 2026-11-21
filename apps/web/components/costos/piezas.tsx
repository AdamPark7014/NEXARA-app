"use client";

/**
 * Piezas de Costos: la banda oscura con las pestañas y el hook de acceso. Los estilos viven en
 * `costos.module.scss` con tokens `--ui-*`.
 */

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button, EmptyState } from "@/components/base";
import { getAcceso, type Acceso, type Tono } from "@/lib/costos";
import { formatApiError } from "@/lib/erp-api";
import c from "./costos.module.scss";

export { c };

const PESTANAS = [
  { href: "/erp/costos", texto: "Horas sin proyecto", requiere: "puedeLigar" },
  { href: "/erp/costos/por-proyecto", texto: "Por proyecto", requiere: "veTodo" },
  { href: "/erp/costos/tarifas", texto: "Tarifas de costo", requiere: "veTodo" },
] as const;

export function Banda({
  acceso,
  titulo,
  subtitulo,
  acciones,
  children,
}: {
  acceso: Acceso | null;
  titulo: ReactNode;
  subtitulo?: ReactNode;
  acciones?: ReactNode;
  children?: ReactNode;
}) {
  const ruta = usePathname();
  const pestanas = PESTANAS.filter((p) => acceso?.[p.requiere]);
  return (
    <header className={c.band}>
      <div className={c.bandHead}>
        <div>
          <div className={c.crumb}>Costos</div>
          <h1 className={c.bandTitle}>{titulo}</h1>
          {subtitulo ? <p className={c.bandSub}>{subtitulo}</p> : null}
        </div>
        {acciones}
      </div>
      {children}
      {pestanas.length > 1 ? (
        <nav className={c.tabs} aria-label="Secciones de costos">
          {pestanas.map((p) => (
            <Link key={p.href} href={p.href} className={c.tab} aria-current={ruta === p.href ? "page" : undefined}>
              {p.texto}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}

export function Kpi({ cifra, texto, tono }: { cifra: ReactNode; texto: ReactNode; tono?: Tono }) {
  return (
    <div className={c.kpi} data-tone={tono}>
      <b>{cifra}</b>
      <span>{texto}</span>
    </div>
  );
}

/**
 * Lo que puede hacer quien entró, según la API. `null` mientras carga. Si la API no contestó (sin red,
 * servidor caído) sigue sin dar acceso, pero lo dice con `sinRespuesta` para que la pantalla no le
 * diga «esta sección no es tuya» a quien sí puede verla; `reintentar` vuelve a preguntar.
 */
export type AccesoCostos = Acceso & { sinRespuesta?: boolean; motivo?: string; reintentar?: () => void };

export function useAccesoCostos(token: string | null | undefined): AccesoCostos | null {
  const [acceso, setAcceso] = useState<AccesoCostos | null>(null);
  const [intento, setIntento] = useState(0);
  useEffect(() => {
    if (!token) return;
    let vivo = true;
    getAcceso(token)
      .then((a) => vivo && setAcceso(a))
      .catch((e: unknown) => {
        if (!vivo) return;
        setAcceso({
          veTodo: false,
          puedeLigar: false,
          sinRespuesta: !fueNegado(e),
          motivo: formatApiError(e, "El servidor no contestó como se esperaba. Vuelve a intentarlo en un momento."),
          reintentar: () => {
            setAcceso(null);
            setIntento((n) => n + 1);
          },
        });
      });
    return () => {
      vivo = false;
    };
  }, [token, intento]);
  return acceso;
}

/** La API no contestó al preguntar el acceso: se dice eso y se ofrece reintentar. */
export function CostosSinRespuesta({ acceso, titulo }: { acceso: AccesoCostos; titulo: string }) {
  return (
    <div className={c.page}>
      <Banda acceso={acceso} titulo={titulo} />
      <EmptyState
        tone="danger"
        title={`No se pudo abrir ${titulo}`}
        description={acceso.motivo ?? "El servidor no contestó. Vuelve a intentarlo en un momento."}
        action={<Button onClick={() => acceso.reintentar?.()}>Reintentar</Button>}
      />
    </div>
  );
}

/** El servidor contestó «no puedes» (401 o 403); cualquier otra falla es que no contestó bien. */
function fueNegado(e: unknown): boolean {
  const texto = e instanceof Error ? e.message : "";
  return /"status(Code)?"\s*:\s*40[13]\b/.test(texto) || /^HTTP 40[13]\b/.test(texto);
}
