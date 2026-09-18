"use client";

import { useState, type FormEvent } from "react";
import {
  ROLES_EQUIPO,
  ROL_EQUIPO_LABEL,
  actualizarMiembro,
  agregarMiembro,
  quitarMiembro,
  type RolEquipo,
} from "@/lib/proyectos-api";
import { guardarCabecera } from "./acciones";
import { PersonaSelect } from "./personas";
import type { SeccionProps } from "./tipos";
import styles from "../proyectos.module.css";

/** Papeles que se eligen en la lista; «Responsable» se asigna con su propio botón. */
const PAPELES = ROLES_EQUIPO.filter((r) => r !== "RESPONSABLE");

export default function SeccionEquipo({ proyecto: p, token, ocupado, personas, mutar, confirmar }: SeccionProps) {
  const [nuevo, setNuevo] = useState<{ userId: string; role: RolEquipo; notas: string }>({
    userId: "",
    role: "INGENIERO",
    notas: "",
  });
  const [errorNuevo, setErrorNuevo] = useState<string | null>(null);

  const enEquipo = p.members.map((m) => m.userId);
  // El responsable primero; luego por papel y nombre.
  const miembros = [...p.members].sort((a, b) => {
    if (a.userId === p.responsableId) return -1;
    if (b.userId === p.responsableId) return 1;
    return (
      ROLES_EQUIPO.indexOf(a.role) - ROLES_EQUIPO.indexOf(b.role) || a.user.nombre.localeCompare(b.user.nombre, "es")
    );
  });

  async function agregar(e: FormEvent) {
    e.preventDefault();
    if (!nuevo.userId) {
      setErrorNuevo("Elige a la persona.");
      return;
    }
    setErrorNuevo(null);
    const nombre = personas.find((x) => String(x.id) === nuevo.userId)?.nombre ?? "La persona";
    const ok = await mutar(
      () =>
        agregarMiembro(token, p.id, {
          userId: Number(nuevo.userId),
          role: nuevo.role,
          ...(nuevo.notas.trim() ? { notas: nuevo.notas.trim() } : {}),
        }),
      `${nombre.replace(/ \(yo\)$/, "")} se sumó al equipo.`,
    );
    if (ok) setNuevo({ userId: "", role: nuevo.role, notas: "" });
  }

  return (
    <div className={styles.gantt} style={{ gap: 12 }}>
      <section className={styles.panel} aria-labelledby="eq-lista">
        <h3 id="eq-lista" className={styles.panelTitle}>
          Equipo del proyecto ({p.members.length})
        </h3>
        {miembros.length === 0 ? (
          <div className={styles.empty}>Nadie en el equipo todavía.</div>
        ) : (
          <ul className={styles.items}>
            {miembros.map((m) => {
              const esResponsable = m.userId === p.responsableId;
              return (
                <li key={m.id} className={styles.item}>
                  <div className={styles.itemMain}>
                    <span className={styles.itemTitle}>{m.user.nombre}</span>
                    <span className={styles.rowWrap}>
                      {[m.user.puesto, m.user.email].filter(Boolean).join(" · ") || "—"}
                    </span>
                    {m.notas ? <span className={styles.rowWrap}>Notas: {m.notas}</span> : null}
                  </div>
                  <div className={styles.itemActions}>
                    {esResponsable ? (
                      <span className={styles.badge}>Responsable</span>
                    ) : (
                      <>
                        <label className={styles.filters}>
                          <span className={styles.filtersLabel}>Papel</span>
                          <select
                            className={styles.select}
                            style={{ width: "auto" }}
                            value={m.role === "RESPONSABLE" ? "COORDINADOR" : m.role}
                            disabled={ocupado}
                            onChange={(e) =>
                              void mutar(
                                () => actualizarMiembro(token, p.id, m.userId, { role: e.target.value as RolEquipo }),
                                `Papel de ${m.user.nombre} actualizado.`,
                              )
                            }
                          >
                            {PAPELES.map((r) => (
                              <option key={r} value={r}>
                                {ROL_EQUIPO_LABEL[r]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          className={styles.smallBtn}
                          disabled={ocupado}
                          onClick={() =>
                            confirmar({
                              title: "Cambiar responsable",
                              message: `${m.user.nombre} será el responsable del proyecto${
                                p.responsable ? ` y ${p.responsable.nombre} quedará como coordinador` : ""
                              }. ¿Seguimos?`,
                              confirmLabel: "Hacer responsable",
                              danger: false,
                              fn: async () => {
                                await mutar(
                                  () => guardarCabecera(token, p, { responsableId: m.userId }),
                                  `${m.user.nombre} es ahora el responsable.`,
                                );
                              },
                            })
                          }
                        >
                          Hacer responsable
                        </button>
                        <button
                          type="button"
                          className={styles.smallDangerBtn}
                          disabled={ocupado}
                          onClick={() =>
                            confirmar({
                              title: "Quitar del equipo",
                              message: `¿Quitar a ${m.user.nombre} del equipo del proyecto?`,
                              confirmLabel: "Quitar",
                              fn: async () => {
                                await mutar(() => quitarMiembro(token, p.id, m.userId), `${m.user.nombre} salió del equipo.`);
                              },
                            })
                          }
                        >
                          Quitar
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className={styles.hint}>
          Para quitar al responsable, primero haz responsable a otra persona. Solo puedes sumar a gente de tu equipo.
        </p>
      </section>

      <form className={styles.panel} onSubmit={agregar} aria-labelledby="eq-nuevo" noValidate>
        <h3 id="eq-nuevo" className={styles.panelTitle}>
          Sumar al equipo
        </h3>
        <div className={styles.inlineForm}>
          <div>
            <label className={styles.fieldLabel} htmlFor="eq-persona">
              Persona
            </label>
            <PersonaSelect
              id="eq-persona"
              value={nuevo.userId}
              onChange={(v) => setNuevo({ ...nuevo, userId: v })}
              personas={personas}
              vacio="Elige a alguien"
              excluir={enEquipo}
            />
          </div>
          <div>
            <label className={styles.fieldLabel} htmlFor="eq-papel">
              Papel
            </label>
            <select
              id="eq-papel"
              className={styles.select}
              value={nuevo.role}
              onChange={(e) => setNuevo({ ...nuevo, role: e.target.value as RolEquipo })}
            >
              {PAPELES.map((r) => (
                <option key={r} value={r}>
                  {ROL_EQUIPO_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={styles.fieldLabel} htmlFor="eq-notas">
              Notas
            </label>
            <input
              id="eq-notas"
              className={styles.input}
              value={nuevo.notas}
              maxLength={300}
              onChange={(e) => setNuevo({ ...nuevo, notas: e.target.value })}
              placeholder="Ej. Apoya solo en la instalación"
            />
          </div>
          <button type="submit" className={styles.primaryBtn} disabled={ocupado}>
            Sumar
          </button>
        </div>
        {errorNuevo ? (
          <p className={styles.error} role="alert">
            {errorNuevo}
          </p>
        ) : null}
      </form>
    </div>
  );
}
