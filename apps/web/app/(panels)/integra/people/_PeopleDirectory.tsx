"use client";

import { PersonFaceThumb } from "../_PersonFace";
import type { ApiUserRow } from "@/lib/users-api";
import styles from "./_people.module.css";
import { CredentialMini, ValidityPill } from "./_PeopleBits";
import {
  describeValidity,
  faceOn,
  userTypeLabel,
  type Person,
} from "./_peopleView";
import type { ViewMode } from "./_usePeopleQuery";

/**
 * Directorio de personas en dos formas: tarjetas con foto (para reconocer una
 * cara) y tabla densa (para barrer cien fichas buscando la que falla). Antes
 * solo había una lista, y las dos tareas se hacían igual de mal.
 */

type Props = {
  /** Ya filtradas y ordenadas por la página. */
  people: Person[];
  view: ViewMode;
  selectedId: string | null;
  onOpen: (p: Person) => void;
  /** Cambia tras subir foto para forzar el re-fetch del rostro. */
  faceBust: number;
  erpFor: (p: Person) => ApiUserRow | null;
  /** Credenciales solo tienen sentido con terminales ISAPI detrás. */
  showCredentials: boolean;
};

/** Solo pide la foto si consta que existe: si no, es un 404 por persona. */
function faceIdOf(p: Person): string | null {
  return faceOn(p) || p.faceUrl ? p.id : null;
}

export function PeopleDirectory({
  people,
  view,
  selectedId,
  onOpen,
  faceBust,
  erpFor,
  showCredentials,
}: Props) {
  if (view === "tabla") {
    return (
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption className={styles.srOnly}>
            Directorio de personas dadas de alta en los terminales de control de acceso
          </caption>
          <thead>
            <tr>
              <th scope="col">
                <span className={styles.srOnly}>Foto</span>
              </th>
              <th scope="col">Nombre</th>
              <th scope="col">Código</th>
              <th scope="col">Tipo</th>
              <th scope="col">Vigencia</th>
              {showCredentials && <th scope="col">Credenciales</th>}
              <th scope="col">Puertas</th>
              <th scope="col">Terminal</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const v = describeValidity(p);
              const erp = erpFor(p);
              const sel = selectedId === p.id;
              return (
                <tr
                  key={p.id}
                  className={styles.tableRow}
                  data-selected={sel ? "1" : undefined}
                  onClick={() => onOpen(p)}
                >
                  <td>
                    <PersonFaceThumb
                      className={styles.tableThumb}
                      size="sm"
                      personId={faceIdOf(p)}
                      personName={p.name}
                      bust={faceBust}
                    />
                  </td>
                  <td>
                    {/* El control accesible es este botón: una <tr> no se enfoca. */}
                    <button
                      type="button"
                      className={styles.rowNameBtn}
                      aria-current={sel ? "true" : undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(p);
                      }}
                    >
                      <span className={styles.cellName}>{p.name}</span>
                    </button>
                    {erp?.email && <span className={styles.cellDim}>{erp.email}</span>}
                  </td>
                  <td className={styles.cellMono}>{p.code || p.id}</td>
                  <td className={styles.cellDim}>{userTypeLabel(p.userType)}</td>
                  <td>
                    <ValidityPill info={v} title />
                  </td>
                  {showCredentials && (
                    <td>
                      <CredentialMini person={p} />
                    </td>
                  )}
                  <td className={styles.cellDim} title={p.doorNames?.join(" · ")}>
                    {p.doorNames?.length ? p.doorNames.join(" · ") : p.doorRight || "—"}
                  </td>
                  <td className={styles.cellDim} title={p.sourceIp}>
                    {p.sourceName || p.sourceIp || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className={styles.cardGrid}>
      {people.map((p) => {
        const v = describeValidity(p);
        const erp = erpFor(p);
        const sel = selectedId === p.id;
        return (
          <button
            key={p.id}
            type="button"
            className={styles.card}
            data-tone={v.tone}
            data-selected={sel ? "1" : undefined}
            aria-current={sel ? "true" : undefined}
            aria-label={`${p.name} · ${p.code || p.id} · ${v.label}`}
            onClick={() => onOpen(p)}
          >
            <PersonFaceThumb
              className={styles.cardPhoto}
              size="lg"
              personId={faceIdOf(p)}
              personName={p.name}
              bust={faceBust}
            />
            <span className={styles.cardName}>{p.name}</span>
            <span className={styles.cardCode}>{p.code || p.id}</span>
            {erp?.role?.nombre && <span className={styles.cardCode}>{erp.role.nombre}</span>}
            <span className={styles.cardFoot}>
              <ValidityPill info={v} />
              {showCredentials && <CredentialMini person={p} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
