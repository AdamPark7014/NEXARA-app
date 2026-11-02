"use client";

import { useEffect, useState } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { Alert, Button, Field, FieldGrid, Input } from "@/components/base";
import Modal from "@/components/ui/Modal";
import { formatApiError } from "@/lib/erp-api";
import {
  archivarFormato,
  crearFormato,
  editarFormato,
  renglonVacio,
  type BorradorFormato,
  type RecetaFormato,
  type RenglonFormato,
} from "@/lib/formatos-actividad";
import DetalleRenglon from "./DetalleRenglon";
import s from "./formatos.module.css";

const VACIO: RecetaFormato = { unidad: null, cantidadPorOmision: 1, renglones: [renglonVacio()] };

/** Crear, editar o archivar un formato. Lo ya asignado no cambia. */
export default function EditorFormato({
  token,
  abierto,
  formatoId,
  inicial,
  onCerrar,
  onGuardado,
}: {
  token: string;
  abierto: boolean;
  /** Sin id, se crea uno nuevo. */
  formatoId: number | null;
  inicial: BorradorFormato | null;
  onCerrar: () => void;
  onGuardado: (id: number | null) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [receta, setReceta] = useState<RecetaFormato>(VACIO);
  const [abiertoRenglon, setAbiertoRenglon] = useState<number | null>(0);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmaArchivar, setConfirmaArchivar] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setNombre(inicial?.nombre ?? "");
    setDescripcion(inicial?.descripcion ?? "");
    setReceta(inicial?.receta ?? { ...VACIO, renglones: [renglonVacio()] });
    setAbiertoRenglon(formatoId ? null : 0);
    setError(null);
    setConfirmaArchivar(false);
  }, [abierto, inicial, formatoId]);

  const cambiarRenglon = (i: number, cambios: Partial<RenglonFormato>) =>
    setReceta((r) => ({ ...r, renglones: r.renglones.map((x, j) => (j === i ? { ...x, ...cambios } : x)) }));

  const guardar = async () => {
    if (nombre.trim().length < 2) return setError("Ponle nombre al formato");
    if (receta.renglones.some((r) => !r.titulo.trim())) return setError("A una actividad le falta el título");
    setGuardando(true);
    setError(null);
    try {
      const datos = { nombre: nombre.trim(), descripcion: descripcion.trim() || null, receta };
      const guardado = formatoId ? await editarFormato(token, formatoId, datos) : await crearFormato(token, datos);
      onGuardado(guardado.id);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setGuardando(false);
    }
  };

  const archivar = async () => {
    if (!formatoId) return;
    setGuardando(true);
    setError(null);
    try {
      await archivarFormato(token, formatoId);
      onGuardado(null);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      open={abierto}
      onClose={onCerrar}
      title={formatoId ? "Editar formato" : "Nuevo formato"}
      size="lg"
      footer={
        <div className={s.pieEditor}>
          {formatoId ? (
            confirmaArchivar ? (
              <span className={s.confirmar}>
                ¿Archivarlo? Lo ya asignado se queda igual.
                <Button size="sm" variant="danger" loading={guardando} onClick={() => void archivar()}>
                  Sí, archivar
                </Button>
                <Button size="sm" variant="tertiary" onClick={() => setConfirmaArchivar(false)}>
                  No
                </Button>
              </span>
            ) : (
              <Button variant="tertiary" onClick={() => setConfirmaArchivar(true)}>
                Archivar
              </Button>
            )
          ) : (
            <span />
          )}
          <span className={s.botonesEditor}>
            <Button variant="secondary" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button variant="primary" loading={guardando} onClick={() => void guardar()}>
              Guardar formato
            </Button>
          </span>
        </div>
      }
    >
      <div className={s.editor}>
        {error ? (
          <Alert tone="danger" role="alert" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        ) : null}
        <FieldGrid>
          <Field label="Nombre" required>
            <Input id="formato-nombre" value={nombre} maxLength={120} onChange={(e) => setNombre(e.target.value)} />
          </Field>
          <Field label="Para qué sirve" optional>
            <Input
              id="formato-descripcion"
              value={descripcion}
              maxLength={300}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </Field>
          <Field label="Qué se cuenta" optional hint="Cámaras, equipos… El tiempo crece con la cantidad.">
            <Input
              id="formato-unidad"
              value={receta.unidad ?? ""}
              maxLength={40}
              onChange={(e) => setReceta((r) => ({ ...r, unidad: e.target.value || null }))}
            />
          </Field>
          <Field label="Cantidad de siempre">
            <Input
              id="formato-cantidad"
              type="number"
              min={1}
              disabled={!receta.unidad}
              value={receta.cantidadPorOmision}
              onChange={(e) =>
                setReceta((r) => ({ ...r, cantidadPorOmision: Math.max(1, Number(e.target.value) || 1) }))
              }
            />
          </Field>
        </FieldGrid>

        <div className={s.subtitulo}>Actividades que crea</div>
        {receta.renglones.map((r, i) => (
          <div className={s.renglonEditor} key={i}>
            <div className={s.cabezaRenglon}>
              <Input
                aria-label={`Título de la actividad ${i + 1}`}
                placeholder="Título de la actividad"
                value={r.titulo}
                maxLength={200}
                onChange={(e) => cambiarRenglon(i, { titulo: e.target.value })}
              />
              <Button
                size="sm"
                variant="tertiary"
                aria-expanded={abiertoRenglon === i}
                onClick={() => setAbiertoRenglon((a) => (a === i ? null : i))}
              >
                {abiertoRenglon === i ? "Ocultar" : "Detalle"}
              </Button>
              <Button
                size="sm"
                variant="tertiary"
                icon
                aria-label={`Quitar ${r.titulo || `la actividad ${i + 1}`}`}
                disabled={receta.renglones.length === 1}
                onClick={() => {
                  setReceta((x) => ({ ...x, renglones: x.renglones.filter((_, j) => j !== i) }));
                  setAbiertoRenglon(null);
                }}
              >
                <CloseRoundedIcon fontSize="inherit" />
              </Button>
            </div>
            {abiertoRenglon === i ? (
              <DetalleRenglon
                id={`editor-${i}`}
                renglon={r}
                minutos={{ unidad: receta.unidad }}
                onCambio={(c) => cambiarRenglon(i, c)}
              />
            ) : null}
          </div>
        ))}
        <div>
          <Button
            size="sm"
            variant="secondary"
            iconStart={<AddRoundedIcon fontSize="inherit" />}
            onClick={() => {
              setReceta((x) => ({ ...x, renglones: [...x.renglones, renglonVacio()] }));
              setAbiertoRenglon(receta.renglones.length);
            }}
          >
            Agregar actividad
          </Button>
        </div>
      </div>
    </Modal>
  );
}
