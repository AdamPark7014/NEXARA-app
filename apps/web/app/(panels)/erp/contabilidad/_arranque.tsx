"use client";

/**
 * Los tres vacíos del escritorio contable.
 *
 * Una sección vacía se veía igual por tres motivos distintos, y los tres se
 * resolvían con una tira de cinco ceros y una frase gris. No es lo mismo:
 *
 *  1. **Sin configurar** — falta algo para siquiera poder operar: no hay
 *     cuentas bancarias, no hay catálogo de cuentas, no hay periodo fiscal.
 *     El vacío dice QUÉ falta y lleva a darlo de alta.
 *  2. **Configurado, sin movimiento** — ya se puede operar y todavía no pasó
 *     nada. El vacío dice QUÉ aparecerá aquí y ofrece la acción que lo genera.
 *  3. **Sin resultados por el filtro** — hay datos, el filtro los esconde. El
 *     vacío ofrece limpiar el filtro. Este ya existía en varias pantallas y se
 *     conserva tal cual: no se mezcla con los otros dos.
 *
 * Y una regla que atraviesa las catorce secciones: cuando no hay NADA detrás,
 * la tira de cifras no se pinta. Una fila de ceros no informa y ocupa justo el
 * sitio de lo que sí ayudaría.
 *
 * Lo que este módulo aporta es el **primer paso**: a dónde ir. Con un cuidado
 * que la pantalla no tenía: una contadora no abre Compras ni Operaciones
 * —`PAGE_MATRIX` no se lo permite—, así que un botón «Dar de alta un
 * proveedor» la mandaría a un 403. Cuando el destino no es suyo, en vez del
 * botón se dice quién lo hace.
 */

import Link from "next/link";
import { useCallback, type ReactNode } from "react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { useUser } from "@/components/UserContext";
import { canUserAccessPath } from "@/lib/user-access";

/** Dónde se da el primer paso, cómo se llama el botón y quién lo hace. */
export type Destino = {
  /** A dónde lleva. Puede traer query (`?tab=cuentas`); se ignora al validar. */
  href: string;
  /** Texto del botón: un verbo, lo que la persona va a hacer. */
  etiqueta: string;
  /** Quién lo hace, para decirlo cuando esa pantalla no es de quien mira. */
  loHace: string;
};

/**
 * El catálogo de primeros pasos. Todos apuntan a pantallas que existen hoy:
 * ninguna se inventa ni se promete.
 *
 * `polizas` es la pantalla de Contabilidad general montada dentro del hub, y
 * acepta `?tab=` — así el enlace cae en la pestaña correcta y no en «Pólizas»
 * obligando a buscar. Las cuentas y los periodos fiscales viven los dos en la
 * pestaña «Catálogo de cuentas».
 */
export const DESTINOS = {
  catalogoCuentas: {
    href: "/erp/contabilidad/polizas?tab=cuentas",
    etiqueta: "Cargar lista de cuentas",
    loHace: "quien lleva el dinero",
  },
  periodoFiscal: {
    href: "/erp/contabilidad/polizas?tab=cuentas",
    etiqueta: "Abrir el mes",
    loHace: "quien lleva el dinero",
  },
  poliza: {
    href: "/erp/contabilidad/polizas?tab=polizas",
    etiqueta: "Registrar un asiento",
    loHace: "quien lleva el dinero",
  },
  presupuesto: {
    href: "/erp/contabilidad/polizas?tab=presupuestos",
    etiqueta: "Crear un presupuesto",
    loHace: "quien lleva el dinero",
  },
  cuentaBancaria: {
    href: "/erp/banking",
    etiqueta: "Agregar cuenta bancaria",
    loHace: "quien administra los bancos",
  },
  bancos: {
    href: "/erp/banking",
    etiqueta: "Ir a bancos",
    loHace: "quien administra los bancos",
  },
  factura: {
    href: "/erp/invoicing",
    etiqueta: "Hacer una factura",
    loHace: "quien factura",
  },
  proveedor: {
    href: "/erp/procurement?tab=orders",
    etiqueta: "Ir a Compras",
    loHace: "Compras, al levantar una orden de compra",
  },
  proyecto: {
    href: "/erp/proyectos",
    etiqueta: "Ir a Proyectos",
    loHace: "Operaciones, al dar de alta el proyecto",
  },
  nomina: {
    href: "/erp/finance/prenomina",
    etiqueta: "Operar la pre-nómina",
    loHace: "quien lleva la nómina",
  },
} satisfies Record<string, Destino>;

/** `/erp/banking?x=1#y` → `/erp/banking`: el permiso es de la ruta, no del query. */
function soloRuta(href: string): string {
  return href.split("#")[0].split("?")[0];
}

/**
 * ¿Esta persona puede abrir esa pantalla? Misma función que usa el AppShell
 * para decidir el sidebar, así que el botón y el menú no se contradicen.
 */
export function usePuedeAbrir(): (href: string) => boolean {
  const { user } = useUser();
  return useCallback((href: string) => canUserAccessPath(user, soloRuta(href)), [user]);
}

/**
 * El botón del primer paso — o, si el destino no es de quien mira, la frase
 * que dice a quién pedírselo. Callar y no poner nada dejaría la pantalla otra
 * vez sin salida; poner el botón la mandaría a una puerta cerrada.
 */
export function AccionPrimerPaso({
  destino,
  variante = "primary",
}: {
  destino: Destino;
  variante?: "primary" | "secondary";
}) {
  const puedeAbrir = usePuedeAbrir();

  if (!puedeAbrir(destino.href)) {
    return (
      <span style={{ fontSize: 12.5, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
        Esto lo hace {destino.loHace}; tu cuenta no abre esa pantalla.
      </span>
    );
  }

  return (
    <Link href={destino.href} style={{ textDecoration: "none" }}>
      <Button size="sm" variant={variante}>
        {destino.etiqueta}
      </Button>
    </Link>
  );
}

/**
 * El vacío que enseña el primer paso. Es `EmptyState` tal cual —no se toca esa
 * pieza— con la acción ya resuelta: qué pasa, por qué, y qué hacer.
 */
export function VacioConPrimerPaso({
  title,
  description,
  destino,
  extra,
  variant = "page",
}: {
  title: ReactNode;
  description: ReactNode;
  /** Sin destino, el vacío informa y no ofrece botón (no se inventa una acción). */
  destino?: Destino;
  /** Una segunda salida discreta: ampliar el periodo, volver a calcular… */
  extra?: ReactNode;
  variant?: "default" | "compact" | "page";
}) {
  return (
    <EmptyState
      variant={variant}
      title={title}
      description={description}
      action={
        destino || extra ? (
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            {destino ? <AccionPrimerPaso destino={destino} /> : null}
            {extra}
          </div>
        ) : undefined
      }
    />
  );
}

/** Un paso de la puesta en marcha del resumen. */
export type PasoArranque = {
  id: string;
  titulo: string;
  /** Por qué hace falta, en una línea. */
  porque: string;
  destino: Destino;
  /**
   * `pendiente` = comprobado y falta · `listo` = comprobado y ya está ·
   * `desconocido` = no se pudo comprobar (sin permiso o falló la consulta).
   * Nunca se adivina: si no se sabe, se dice que no se sabe.
   */
  estado: "pendiente" | "listo" | "desconocido";
};

/**
 * La puesta en marcha del resumen: qué falta, en qué orden, y el enlace a cada
 * paso. Sustituye a la tira de cinco ceros cuando detrás no hay nada.
 *
 * Numerada a propósito: el orden no es decorativo —sin cuentas no hay pólizas,
 * sin periodo no hay cierre— y una lista de viñetas no lo diría.
 */
export function PuestaEnMarcha({ pasos }: { pasos: PasoArranque[] }) {
  const puedeAbrir = usePuedeAbrir();

  return (
    <ol
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        border: "1px solid var(--nx-panel-hairline, var(--border))",
        borderRadius: 10,
        overflow: "hidden",
        background: "var(--surface)",
        counterReset: "paso",
      }}
    >
      {pasos.map((paso, i) => {
        const hecho = paso.estado === "listo";
        const abrible = puedeAbrir(paso.destino.href);
        return (
          <li
            key={paso.id}
            style={{
              display: "grid",
              gridTemplateColumns: "26px minmax(0, 1fr) auto",
              gap: 12,
              alignItems: "baseline",
              padding: "12px 14px",
              borderTop:
                i === 0 ? undefined : "1px solid var(--nx-panel-hairline, var(--border))",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                fontSize: 12,
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
                color: hecho ? "var(--state-success-text, #15803d)" : "var(--text-tertiary)",
              }}
            >
              {hecho ? "✓" : i + 1}
            </span>

            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13.5,
                  fontWeight: hecho ? 500 : 600,
                  color: hecho ? "var(--text-secondary)" : "var(--text-primary)",
                }}
              >
                {paso.titulo}
              </div>
              <p
                style={{
                  margin: "3px 0 0",
                  fontSize: 12,
                  color: "var(--text-tertiary)",
                  lineHeight: 1.45,
                }}
              >
                {paso.porque}
                {paso.estado === "desconocido" ? (
                  <> No se pudo comprobar si ya está: tu cuenta no consulta esa parte.</>
                ) : null}
              </p>
            </div>

            <span style={{ whiteSpace: "nowrap" }}>
              {hecho ? (
                <span style={{ fontSize: 12, color: "var(--state-success-text, #15803d)" }}>
                  Ya está
                </span>
              ) : abrible ? (
                <Link
                  href={paso.destino.href}
                  style={{ fontSize: 12.5, fontWeight: 600, color: "var(--primary)" }}
                >
                  {paso.destino.etiqueta} →
                </Link>
              ) : (
                <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                  Lo hace {paso.destino.loHace}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
