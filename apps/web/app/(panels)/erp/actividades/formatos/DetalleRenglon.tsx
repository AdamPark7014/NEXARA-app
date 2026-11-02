"use client";

import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { Button, Checkbox, Field, FieldGrid, Input, Select, Textarea } from "@/components/base";
import { TAREA_TIPOS } from "@/lib/activity-kinds";
import type { RenglonFormato, TipoRenglon } from "@/lib/formatos-actividad";
import s from "./formatos.module.css";

const MOMENTOS = [
  { id: "ANTES", label: "Antes" },
  { id: "EN_PROGRESO", label: "Durante" },
  { id: "DESPUES", label: "Después" },
];

/** Tipo y subtipo en una sola lista: un clic en vez de dos. */
function valorDeTipo(r: Pick<RenglonFormato, "coreKind" | "tipo">): string {
  return r.coreKind === "tarea" ? `tarea:${r.tipo ?? ""}` : r.coreKind;
}

function tipoDeValor(valor: string): { coreKind: TipoRenglon; tipo: string | null } {
  if (valor.startsWith("tarea:")) return { coreKind: "tarea", tipo: valor.slice(6) || null };
  return { coreKind: valor as TipoRenglon, tipo: null };
}

/**
 * Lo que trae un renglón además del título: tipo, fotos, puntos de evidencia, herramientas e
 * indicaciones. Se usa al editar el formato y al asignar, para que todo se pueda cambiar en los dos.
 */
export default function DetalleRenglon({
  renglon,
  onCambio,
  id,
  minutos,
}: {
  renglon: RenglonFormato;
  onCambio: (cambios: Partial<RenglonFormato>) => void;
  id: string;
  /** En el formato se capturan los minutos fijos y por unidad; al asignar, el total va en el renglón. */
  minutos?: { unidad: string | null };
}) {
  const tipoGuardado = renglon.coreKind === "tarea" && renglon.tipo && !TAREA_TIPOS.some((t) => t.label === renglon.tipo);

  const cambiarPunto = (i: number, cambios: Partial<RenglonFormato["puntos"][number]>) =>
    onCambio({ puntos: renglon.puntos.map((p, j) => (j === i ? { ...p, ...cambios } : p)) });
  const cambiarHerramienta = (i: number, cambios: Partial<RenglonFormato["herramientas"][number]>) =>
    onCambio({ herramientas: renglon.herramientas.map((h, j) => (j === i ? { ...h, ...cambios } : h)) });

  return (
    <div className={s.detalle}>
      <FieldGrid>
        <Field label="Tipo">
          <Select id={`${id}-tipo`} value={valorDeTipo(renglon)} onChange={(e) => onCambio(tipoDeValor(e.target.value))}>
            <optgroup label="Tarea">
              <option value="tarea:">Otra tarea</option>
              {TAREA_TIPOS.map((t) => (
                <option key={t.id} value={`tarea:${t.label}`}>
                  {t.label}
                </option>
              ))}
              {tipoGuardado ? <option value={`tarea:${renglon.tipo}`}>{renglon.tipo}</option> : null}
            </optgroup>
            <option value="servicio">Servicio a cliente</option>
            <option value="comercial">Comercial</option>
          </Select>
        </Field>
        <Field label="Fotos de evidencia por persona" hint="De 2 a 8">
          <Input
            id={`${id}-fotos`}
            type="number"
            min={2}
            max={8}
            value={renglon.fotos}
            onChange={(e) => onCambio({ fotos: Number(e.target.value) || 2 })}
            onBlur={() => onCambio({ fotos: Math.min(8, Math.max(2, Math.round(renglon.fotos))) })}
          />
        </Field>
        {minutos ? (
          <>
            <Field label="Minutos fijos">
              <Input
                id={`${id}-base`}
                type="number"
                min={0}
                value={renglon.minutosBase}
                onChange={(e) => onCambio({ minutosBase: Math.max(0, Number(e.target.value) || 0) })}
              />
            </Field>
            <Field
              label={minutos.unidad ? `Minutos por cada una: ${minutos.unidad.toLowerCase()}` : "Minutos por unidad"}
              hint={minutos.unidad ? undefined : "Ponle unidad al formato para usarlos"}
            >
              <Input
                id={`${id}-unidad`}
                type="number"
                min={0}
                disabled={!minutos.unidad}
                value={renglon.minutosPorUnidad}
                onChange={(e) => onCambio({ minutosPorUnidad: Math.max(0, Number(e.target.value) || 0) })}
              />
            </Field>
          </>
        ) : null}
      </FieldGrid>

      <div className={s.subgrupo}>
        <div className={s.subtitulo}>Qué fotografiar por nombre</div>
        {renglon.puntos.map((p, i) => (
          <div className={s.punto} key={i}>
            <Input
              aria-label={`Punto de evidencia ${i + 1}`}
              placeholder="Rack, canalización…"
              value={p.nombre}
              onChange={(e) => cambiarPunto(i, { nombre: e.target.value })}
            />
            <div className={s.momentos}>
              {MOMENTOS.map((m) => (
                <Checkbox
                  key={m.id}
                  label={m.label}
                  checked={p.momentos.includes(m.id)}
                  onChange={(e) =>
                    cambiarPunto(i, {
                      momentos: e.target.checked ? [...p.momentos, m.id] : p.momentos.filter((x) => x !== m.id),
                    })
                  }
                />
              ))}
            </div>
            <Button
              size="sm"
              variant="tertiary"
              icon
              aria-label={`Quitar el punto ${p.nombre || i + 1}`}
              onClick={() => onCambio({ puntos: renglon.puntos.filter((_, j) => j !== i) })}
            >
              <CloseRoundedIcon fontSize="inherit" />
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="tertiary"
          iconStart={<AddRoundedIcon fontSize="inherit" />}
          onClick={() => onCambio({ puntos: [...renglon.puntos, { nombre: "", momentos: ["DESPUES"] }] })}
        >
          Agregar punto
        </Button>
      </div>

      <div className={s.subgrupo}>
        <div className={s.subtitulo}>Herramientas que se llevan</div>
        {renglon.herramientas.length ? (
          <p className={s.pista}>Hay que tenerlas listas para poder iniciar la actividad.</p>
        ) : null}
        {renglon.herramientas.map((h, i) => (
          <div className={s.herramienta} key={i}>
            <Input
              aria-label={`Herramienta ${i + 1}`}
              placeholder="Escalera, taladro…"
              value={h.descripcion}
              onChange={(e) => cambiarHerramienta(i, { descripcion: e.target.value })}
            />
            <Input
              aria-label={`Cantidad de ${h.descripcion || "la herramienta"}`}
              type="number"
              min={1}
              value={h.cantidad}
              onChange={(e) => cambiarHerramienta(i, { cantidad: Math.max(1, Number(e.target.value) || 1) })}
            />
            <Button
              size="sm"
              variant="tertiary"
              icon
              aria-label={`Quitar ${h.descripcion || "la herramienta"}`}
              onClick={() => onCambio({ herramientas: renglon.herramientas.filter((_, j) => j !== i) })}
            >
              <CloseRoundedIcon fontSize="inherit" />
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="tertiary"
          iconStart={<AddRoundedIcon fontSize="inherit" />}
          onClick={() => onCambio({ herramientas: [...renglon.herramientas, { descripcion: "", cantidad: 1 }] })}
        >
          Agregar herramienta
        </Button>
      </div>

      <Field label="Indicaciones" optional>
        <Textarea
          id={`${id}-indicaciones`}
          rows={2}
          value={renglon.indicaciones ?? ""}
          onChange={(e) => onCambio({ indicaciones: e.target.value || null })}
        />
      </Field>
    </div>
  );
}
