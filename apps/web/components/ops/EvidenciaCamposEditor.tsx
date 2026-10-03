"use client";

import { useEffect, useId, useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import CheckIcon from "@mui/icons-material/Check";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import {
  MAX_CAMPOS,
  MAX_LARGO_NOMBRE,
  MAX_LARGO_NOTAS,
  MOMENTOS,
  MOMENTO_LABEL,
  PRESETS_CAMPOS,
  campoVacio,
  nombreLibre,
  ordenarMomentos,
  type CampoBorrador,
  type ErroresCampos,
  type Momento,
} from "@/lib/evidencia-campos";
import { Button, Input } from "@/components/base";
import s from "./EvidenciaCamposEditor.module.css";

type Props = {
  value: CampoBorrador[];
  onChange: (next: CampoBorrador[]) => void;
  /** Errores de la validación completa; `null` mientras no se intente guardar. */
  errores?: ErroresCampos | null;
  disabled?: boolean;
};


/**
 * Editor de «qué hay que fotografiar»: una fila por cosa (Cámara 1, Rack…) con los momentos
 * en que se pide foto. Controlado: el padre guarda la lista y decide cuándo mandarla.
 */
export default function EvidenciaCamposEditor({ value, onChange, errores, disabled = false }: Props) {
  const idBase = useId();
  const [enfocar, setEnfocar] = useState<string | null>(null);
  const lleno = value.length >= MAX_CAMPOS;

  useEffect(() => {
    if (!enfocar) return;
    const el = document.getElementById(`${idBase}-${enfocar}-nombre`) as HTMLInputElement | null;
    el?.focus();
    setEnfocar(null);
  }, [enfocar, idBase]);

  const cambiar = (key: string, parcial: Partial<CampoBorrador>) =>
    onChange(value.map((f) => (f.key === key ? { ...f, ...parcial } : f)));

  const alternarMomento = (fila: CampoBorrador, momento: Momento) => {
    const tiene = fila.momentos.includes(momento);
    cambiar(fila.key, {
      momentos: ordenarMomentos(tiene ? fila.momentos.filter((m) => m !== momento) : [...fila.momentos, momento]),
    });
  };

  const agregar = (fila: CampoBorrador, enfocarNombre: boolean) => {
    if (lleno) return;
    onChange([...value, fila]);
    if (enfocarNombre) setEnfocar(fila.key);
  };

  const quitar = (key: string) => onChange(value.filter((f) => f.key !== key));

  return (
    <div className={s.editor}>
      <div className={s.rapido}>
        <span className={s.rapidoT}>Agregar rápido:</span>
        {PRESETS_CAMPOS.map((p) => (
          <Button
            key={p.nombre}
            size="sm"
            className={s.chip}
            disabled={lleno || disabled}
            iconStart={<AddIcon fontSize="inherit" />}
            onClick={() =>
              agregar(
                campoVacio(
                  nombreLibre(
                    p.nombre,
                    value.map((f) => f.nombre),
                    p.numerar,
                  ),
                  p.momentos,
                ),
                false,
              )
            }
          >
            {p.nombre}
          </Button>
        ))}
      </div>

      {value.length > 0 ? (
        <ol className={s.filas}>
          {value.map((fila, i) => {
            const nombreId = `${idBase}-${fila.key}-nombre`;
            const errorId = `${idBase}-${fila.key}-error`;
            const mensaje =
              errores?.porFila[fila.key] ??
              (fila.momentos.length === 0 ? "Elige al menos un momento: antes, en progreso o después." : null);
            const nombreVisible = fila.nombre.trim() || `punto ${i + 1}`;
            return (
              <li key={fila.key} className={s.fila} data-error={mensaje ? "true" : undefined}>
                <div className={s.filaArriba}>
                  <label htmlFor={nombreId} className={s.nombre}>
                    <span className={s.etiqueta}>Punto {i + 1} · Qué fotografiar</span>
                    <Input
                      id={nombreId}
                      value={fila.nombre}
                      maxLength={MAX_LARGO_NOMBRE}
                      placeholder="Ej. Cámara 1, Rack, Canalización"
                      disabled={disabled}
                      aria-invalid={Boolean(mensaje)}
                      aria-describedby={mensaje ? errorId : undefined}
                      onChange={(e) => cambiar(fila.key, { nombre: e.target.value })}
                    />
                  </label>
                  <div role="group" aria-label={`Momentos en que se pide foto de ${nombreVisible}`} className={s.momentos}>
                    {MOMENTOS.map((m) => {
                      const on = fila.momentos.includes(m);
                      return (
                        <Button
                          key={m}
                          size="sm"
                          aria-pressed={on}
                          disabled={disabled}
                          onClick={() => alternarMomento(fila, m)}
                          className={s.chip}
                          iconStart={on ? <CheckIcon fontSize="inherit" /> : undefined}
                        >
                          {MOMENTO_LABEL[m]}
                        </Button>
                      );
                    })}
                  </div>
                  <Button
                    size="sm"
                    variant="danger-ghost"
                    onClick={() => quitar(fila.key)}
                    disabled={disabled}
                    aria-label={`Quitar ${nombreVisible}`}
                    title="Quitar"
                    iconStart={<DeleteOutlineIcon fontSize="inherit" />}
                  >
                    Quitar
                  </Button>
                </div>
                <Input
                  controlSize="sm"
                  value={fila.notas}
                  maxLength={MAX_LARGO_NOTAS}
                  placeholder="Nota para quien toma la foto (opcional). Ej. que se vea la etiqueta"
                  aria-label={`Nota para la foto de ${nombreVisible} (opcional)`}
                  disabled={disabled}
                  onChange={(e) => cambiar(fila.key, { notas: e.target.value })}
                />
                {mensaje ? (
                  <p id={errorId} className={s.error}>
                    {mensaje}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}

      <div className={s.pie}>
        <Button
          size="sm"
          className={s.agregar}
          disabled={lleno || disabled}
          onClick={() => agregar(campoVacio(), true)}
          iconStart={<AddIcon fontSize="inherit" />}
        >
          Agregar punto
        </Button>
        {value.length > 0 ? (
          <span className={s.cuenta}>
            {value.length} de {MAX_CAMPOS} puntos
          </span>
        ) : null}
      </div>

      {errores?.general ? (
        <p role="alert" className={s.error}>
          {errores.general}
        </p>
      ) : null}
    </div>
  );
}
