"use client";

import { Badge } from "@/components/base";
import { CLIENT_SECTOR_ICONS } from "@/components/erp/ClientSectorIcon";
import { CLIENT_SECTOR_META, type ClientSector } from "@/lib/client-sectors";
import { nombreSector } from "../sectores";
import styles from "../clientes-core.module.css";

/**
 * Tipo del padrón (Comercial · Corporativo · Proyecto) como insignia con su glifo.
 * Un mismo cliente puede tener varios: nunca se muestra el código crudo de la API.
 */
export function TipoCliente({ sector, size = "md" }: { sector: ClientSector; size?: "sm" | "md" }) {
  const meta = CLIENT_SECTOR_META[sector];
  const Icono = meta ? CLIENT_SECTOR_ICONS[meta.icon] : null;
  return (
    <Badge tone="outline" size={size} icon={Icono ? <Icono fontSize="inherit" /> : undefined}>
      {nombreSector(sector)}
    </Badge>
  );
}

/** Todos los tipos de un cliente, en renglón que se acomoda solo. */
export function TiposCliente({
  sectores,
  size = "md",
  vacio = "Sin tipo",
}: {
  sectores: ReadonlyArray<ClientSector>;
  size?: "sm" | "md";
  vacio?: string;
}) {
  if (!sectores.length) return <span className={styles.tenue}>{vacio}</span>;
  return (
    <span className={styles.tipos}>
      {sectores.map((s) => (
        <TipoCliente key={s} sector={s} size={size} />
      ))}
    </span>
  );
}
