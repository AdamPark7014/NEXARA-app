"use client";

/**
 * Detalle de actividad · «Costo directo» (28-10, propuesta UI/UX): lo que ya carga la actividad
 * en viáticos (su parte del reparto) y en material que salió del almacén. Solo dirección y
 * coordinación. Sin nada que sumar no se pinta: hoy casi ningún gasto pasa por el sistema y una
 * tarjeta en ceros no dice nada. La mano de obra y el margen llegan cuando la nómina y la factura
 * pasen por aquí (`.ai/CUMPLIMIENTO-EVALUADOR-SPEC.md` §7.3 ter).
 */
import { useEffect, useState } from "react";
import { AsideCard } from "@/components/base";
import { useUser } from "@/components/UserContext";
import { listActivityMaterials, listViaticsForActivity } from "@/lib/ops-activities-api";
import { ROLES, type RoleKey } from "@/lib/rbac";
import { resolveV2RoleKey } from "@/lib/user-access";
import s from "./CostoActividad.module.css";

const VEN_COSTO: ReadonlySet<RoleKey> = new Set<RoleKey>([
  ROLES.CEO,
  ROLES.DIR_ADMIN,
  ROLES.DIR_OPERACIONES,
  ROLES.COORD_ADMIN,
  ROLES.COORD_OPERACIONES,
]);

const dinero = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

type Costo = { viaticos: number; nViaticos: number; material: number; nMaterial: number };

export default function CostoActividad({ activityId }: { activityId: number }) {
  const { user } = useUser();
  const token = user?.token ?? "";
  const rol = resolveV2RoleKey(user);
  const puedeVer = Boolean(user?.isSuperAdmin) || (rol != null && VEN_COSTO.has(rol));
  const [costo, setCosto] = useState<Costo | null>(null);

  useEffect(() => {
    if (!token || !puedeVer || !activityId) return;
    let vivo = true;
    Promise.allSettled([listViaticsForActivity(token, activityId), listActivityMaterials(token, activityId)]).then(
      ([v, m]) => {
        if (!vivo) return;
        const viaticos = v.status === "fulfilled" ? v.value : [];
        const materiales = m.status === "fulfilled" ? m.value : null;
        setCosto({
          viaticos: viaticos.reduce((acc, x) => acc + (Number(x.montoEnEstaActividad) || 0), 0),
          nViaticos: viaticos.length,
          material: Number(materiales?.costoTotal) || 0,
          nMaterial: materiales?.movimientos?.length ?? 0,
        });
      },
    );
    return () => {
      vivo = false;
    };
  }, [token, puedeVer, activityId]);

  if (!puedeVer || !costo) return null;
  const total = costo.viaticos + costo.material;
  if (total <= 0 && costo.nViaticos === 0 && costo.nMaterial === 0) return null;

  return (
    <AsideCard title="Costo directo">
      <dl className={s.lista}>
        <div className={s.fila}>
          <dt>Viáticos{costo.nViaticos ? ` · ${costo.nViaticos}` : ""}</dt>
          <dd>{dinero(costo.viaticos)}</dd>
        </div>
        <div className={s.fila}>
          <dt>Material del almacén{costo.nMaterial ? ` · ${costo.nMaterial}` : ""}</dt>
          <dd>{dinero(costo.material)}</dd>
        </div>
        <div className={[s.fila, s.total].join(" ")}>
          <dt>Total</dt>
          <dd>{dinero(total)}</dd>
        </div>
      </dl>
      <p className={s.nota}>La mano de obra y el margen aparecen cuando la nómina y la factura pasen por el sistema.</p>
    </AsideCard>
  );
}
