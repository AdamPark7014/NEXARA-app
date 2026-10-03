"use client";

import { useState, type FormEvent } from "react";
import PersonAddAltOutlinedIcon from "@mui/icons-material/PersonAddAltOutlined";
import { Alert, Badge, Button, Field, Input, PersonCell, RecordSection, Select } from "@/components/base";
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
import styles from "./secciones.module.css";

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
    <div className={styles.pila}>
      <RecordSection
        title={
          <>
            Equipo del proyecto<span className={styles.conteo}>{p.members.length}</span>
          </>
        }
        subtitle="Para quitar al responsable, primero haz responsable a otra persona. Solo puedes sumar a gente de tu equipo."
      >
        {miembros.length === 0 ? (
          <p className={styles.vacio}>Nadie en el equipo todavía.</p>
        ) : (
          <ul className={styles.lista}>
            {miembros.map((m) => {
              const esResponsable = m.userId === p.responsableId;
              const detalle = [m.user.puesto, m.user.email].filter(Boolean).join(" · ") || "—";
              return (
                <li key={m.id} className={styles.fila}>
                  <div className={styles.principal}>
                    <PersonCell name={m.user.nombre} subtitle={detalle} size={32} />
                    {m.notas ? <span className={styles.meta}>Notas: {m.notas}</span> : null}
                  </div>
                  <div className={styles.acciones}>
                    {esResponsable ? (
                      <Badge tone="brand">Responsable</Badge>
                    ) : (
                      <>
                        <Select
                          aria-label={`Papel de ${m.user.nombre}`}
                          controlSize="sm"
                          wrapperClassName={styles.selectCompacto}
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
                        </Select>
                        <Button
                          size="sm"
                          variant="ghost"
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
                        </Button>
                        <Button
                          size="sm"
                          variant="danger-ghost"
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
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </RecordSection>

      <form className={styles.alta} onSubmit={agregar} aria-labelledby="eq-nuevo" noValidate>
        <h3 id="eq-nuevo" className={styles.altaTitulo}>
          Sumar al equipo
        </h3>
        <div className={styles.campos}>
          <Field label="Persona">
            <PersonaSelect
              id="eq-persona"
              value={nuevo.userId}
              onChange={(v) => setNuevo({ ...nuevo, userId: v })}
              personas={personas}
              vacio="Elige a alguien"
              excluir={enEquipo}
            />
          </Field>
          <Field label="Papel">
            <Select id="eq-papel" value={nuevo.role} onChange={(e) => setNuevo({ ...nuevo, role: e.target.value as RolEquipo })}>
              {PAPELES.map((r) => (
                <option key={r} value={r}>
                  {ROL_EQUIPO_LABEL[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Notas">
            <Input
              id="eq-notas"
              value={nuevo.notas}
              maxLength={300}
              onChange={(e) => setNuevo({ ...nuevo, notas: e.target.value })}
              placeholder="Ej. Apoya solo en la instalación"
            />
          </Field>
          <Button type="submit" variant="tonal" disabled={ocupado} iconStart={<PersonAddAltOutlinedIcon />}>
            Sumar
          </Button>
        </div>
        {errorNuevo ? (
          <Alert tone="danger" role="alert" dense>
            {errorNuevo}
          </Alert>
        ) : null}
      </form>
    </div>
  );
}
