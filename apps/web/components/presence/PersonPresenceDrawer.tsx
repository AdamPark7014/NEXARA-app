"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatApiError } from "@/lib/erp-api";
import { PersonFaceThumb } from "@/components/presence/_PersonFace";
import {
  fetchPersonPresence,
  hhmmEs,
  type PersonPresenceDetail,
  type PresenceOccRow,
} from "@/lib/presence-api";
import styles from "./EnSitioStrip.module.css";

const STAGE_ES: Record<string, string> = {
  DISCOVERY: "Descubrimiento",
  QUALIFICATION: "Calificación",
  PROPOSAL: "Propuesta",
  NEGOTIATION: "Negociación",
  CLOSING: "Cierre",
  NEW: "Nuevo",
  QUALIFIED: "Calificado",
  NURTURING: "Nutrición",
};

export function PersonPresenceDrawer({
  person,
  onClose,
}: {
  person: PresenceOccRow;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<PersonPresenceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stop = false;
    setLoading(true);
    setError(null);
    void fetchPersonPresence(person.personId)
      .then((d) => {
        if (!stop) setDetail(d);
      })
      .catch((e) => {
        if (!stop) setError(formatApiError(e, "No se pudo cargar la ficha"));
      })
      .finally(() => {
        if (!stop) setLoading(false);
      });
    return () => {
      stop = true;
    };
  }, [person.personId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const name = detail?.personName || person.personName || person.personId;
  const erp = detail?.erpUser;

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <aside
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-label={`Presencia de ${name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.drawerHead}>
          <button type="button" className={styles.back} onClick={onClose}>
            ‹ En sitio
          </button>
          <PersonFaceThumb
            className={styles.photo}
            size="lg"
            personId={person.personId}
            personName={name}
            photoPath={detail?.lastPhoto || person.lastPhoto}
          />
          <div>
            <h2>{name}</h2>
            <p>{detail?.lastDoor || person.lastDoor || "Acceso"}</p>
            {detail?.personCode ? <p>Código {detail.personCode}</p> : null}
            <span className={styles.badge} data-off={detail && !detail.onSite ? "1" : undefined}>
              {detail ? (detail.onSite ? "En sitio ahora" : "No en sitio") : "Cargando…"}
            </span>
          </div>
        </header>

        <div className={styles.drawerBody}>
          {loading && <p className={styles.empty}>Cargando ficha…</p>}
          {error && (
            <p className={styles.hint} data-tone="error">
              {error}
            </p>
          )}

          {!loading && !error && (
            <>
              <section className={styles.section}>
                <h3>Identidad</h3>
                {erp ? (
                  <dl className={styles.metaGrid}>
                    <div>
                      <dt>ERP</dt>
                      <dd>{erp.nombre}</dd>
                    </div>
                    <div>
                      <dt>Nº empleado</dt>
                      <dd>{erp.employeeNumber || "—"}</dd>
                    </div>
                    <div>
                      <dt>Rol</dt>
                      <dd>{erp.role || "—"}</dd>
                    </div>
                    <div>
                      <dt>Área</dt>
                      <dd>{erp.department || "—"}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className={styles.empty}>Sin vínculo con un usuario del ERP.</p>
                )}
              </section>

              <section className={styles.section}>
                <h3>Puertas hoy ({detail?.doorsToday.length ?? 0})</h3>
                {!detail?.doorsToday.length ? (
                  <p className={styles.empty}>Sin pases ACS registrados hoy.</p>
                ) : (
                  <ul>
                    {detail.doorsToday.map((d) => (
                      <li key={d.id}>
                        <strong>{d.door}</strong>
                        <span>{hhmmEs(d.at)}</span>
                        {d.verifyMode ? <span>{d.verifyMode}</span> : null}
                        {d.label ? <span>{d.label}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className={styles.section}>
                <h3>Actividades abiertas ({detail?.openActivities.length ?? 0})</h3>
                {!erp ? (
                  <p className={styles.empty}>Requiere usuario ERP vinculado.</p>
                ) : !detail?.openActivities.length ? (
                  <p className={styles.empty}>Sin actividades abiertas a cargo.</p>
                ) : (
                  <ul>
                    {detail.openActivities.map((a) => (
                      <Link
                        key={a.id}
                        href={`/ops/activities/${a.id}`}
                        className={styles.linkRow}
                      >
                        <strong>{a.anNumber}</strong>
                        <span>{a.titulo}</span>
                        <span>{a.estatus}</span>
                        {a.clientName ? <span>{a.clientName}</span> : null}
                      </Link>
                    ))}
                  </ul>
                )}
              </section>

              <section className={styles.section}>
                <h3>CRM</h3>
                {!erp ? (
                  <p className={styles.empty}>Requiere usuario ERP vinculado.</p>
                ) : !detail?.crm ? (
                  <p className={styles.empty}>Sin leads ni oportunidades abiertas a su nombre.</p>
                ) : (
                  <ul>
                    {detail.crm.leads.map((l) => (
                      <Link key={`l-${l.id}`} href={`/crm/leads/${l.id}`} className={styles.linkRow}>
                        <strong>{l.name || l.company || `Lead #${l.id}`}</strong>
                        <span>Lead</span>
                        <span>{STAGE_ES[l.status] || l.status}</span>
                        {l.name && l.company ? <span>{l.company}</span> : null}
                      </Link>
                    ))}
                    {detail.crm.opportunities.map((o) => (
                      <Link
                        key={`o-${o.id}`}
                        href={`/crm/opportunities/${o.id}`}
                        className={styles.linkRow}
                      >
                        <strong>{o.title}</strong>
                        <span>{STAGE_ES[o.stage] || o.stage}</span>
                        {o.clientName ? <span>{o.clientName}</span> : null}
                        {o.value > 0 ? (
                          <span>
                            {o.value.toLocaleString("es-MX", {
                              style: "currency",
                              currency: "MXN",
                              maximumFractionDigits: 0,
                            })}
                          </span>
                        ) : null}
                      </Link>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
