"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardHead,
  Checkbox,
  DateInput,
  Field,
  Input,
  Select,
  SkeletonRows,
  Stat,
  StatRow,
  Textarea,
} from "@/components/base";
import { formatApiError } from "@/lib/erp-api";
import {
  DIAS_DE_AVISO,
  NOMBRE_FESTIVO_MAX,
  NOTA_FESTIVO_MAX,
  comoSeTrabaja,
  diasEntre,
  duracionHorario,
  enLaNomina,
  fechaCorta,
  fechaLarga,
  fetchFestivos,
  fichaDeFecha,
  guardarFestivo,
  quienTrabaja,
  quitarFestivo,
  sumaDias,
  type Festivo,
  type FestivosRango,
  type ModoFestivo,
} from "@/lib/festivos-api";
import s from "./festivos.module.css";

const ERROR_CARGA = "No se pudieron cargar los días festivos.";
const ERROR_GUARDAR = "No se pudo guardar el día.";
const ERROR_QUITAR = "No se pudo quitar el día.";

/** Una sola frase. Si el API manda un párrafo, se queda el respaldo. */
function unaFrase(texto: string, respaldo: string): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (!limpio) return respaldo;
  return limpio.split(/(?<=[.!?])\s+/).filter(Boolean).length > 1 ? respaldo : limpio;
}

type Borrador = {
  /** null = día nuevo de la empresa. */
  existente: Festivo | null;
  fecha: string;
  nombre: string;
  modo: ModoFestivo;
  horaEntrada: string;
  horaSalida: string;
  soloAlgunos: boolean;
  personas: number[];
  pagoDoble: boolean;
  avisar: boolean;
  nota: string;
};

function borradorDe(f: Festivo | null, hoy: string): Borrador {
  return {
    existente: f,
    fecha: f?.fecha ?? sumaDias(hoy, 1),
    nombre: f?.nombre ?? "",
    modo: f?.modo ?? "NO_SE_LABORA",
    horaEntrada: f?.horaEntrada ?? "10:00",
    horaSalida: f?.horaSalida ?? "14:00",
    soloAlgunos: Boolean(f?.personas.length),
    personas: f?.personas ?? [],
    pagoDoble: f?.pagoDoble ?? true,
    avisar: f?.avisar ?? true,
    nota: f?.nota ?? "",
  };
}

function Ficha({ fecha, tono }: { fecha: string; tono: "descanso" | "labora" | "finde" }) {
  const f = fichaDeFecha(fecha);
  return (
    <span className={s.ficha} data-tono={tono} aria-hidden="true">
      <span className={s.fichaMes}>{f.mes}</span>
      <span className={s.fichaDia}>{f.dia}</span>
      <span className={s.fichaSemana}>{f.semana}</span>
    </span>
  );
}

const tonoDe = (f: Festivo): "descanso" | "labora" | "finde" =>
  f.finDeSemana ? "finde" : f.modo === "NO_SE_LABORA" ? "descanso" : "labora";

/**
 * Días festivos: los de ley vienen solos; dirección decide si se labora, con qué horario, quién
 * trabaja y si se paga doble. Lo usan la nómina, el desempeño, la checada y el recordatorio.
 */
export default function FestivosPanel({ token }: { token: string }) {
  const [datos, setDatos] = useState<FestivosRango | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<ConfirmState | null>(null);

  const cargar = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    setError(null);
    try {
      setDatos(await fetchFestivos(token));
    } catch (e) {
      setError(unaFrase(formatApiError(e, ERROR_CARGA), ERROR_CARGA));
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const porAnio = useMemo(() => {
    const m = new Map<string, Festivo[]>();
    for (const f of datos?.items ?? []) m.set(f.fecha.slice(0, 4), [...(m.get(f.fecha.slice(0, 4)) ?? []), f]);
    return [...m.entries()];
  }, [datos]);

  const personaPor = useMemo(() => new Map((datos?.personas ?? []).map((p) => [p.id, p])), [datos]);

  if (cargando && !datos) {
    return (
      <div className={s.panel}>
        <h2 className={s.titulo}>Días festivos</h2>
        <SkeletonRows rows={5} label="Cargando días festivos" />
      </div>
    );
  }
  if (error && !datos) {
    return (
      <div className={s.panel}>
        <h2 className={s.titulo}>Días festivos</h2>
        <p className={s.frase} role="alert">
          {error}
        </p>
        <div className={s.reintento}>
          <Button size="sm" onClick={() => void cargar()}>
            Reintentar
          </Button>
        </div>
      </div>
    );
  }
  if (!datos) return null;

  if (borrador) {
    return (
      <Editor
        datos={datos}
        borrador={borrador}
        setBorrador={setBorrador}
        guardando={guardando}
        error={errorForm}
        onCancelar={() => {
          setBorrador(null);
          setErrorForm(null);
        }}
        onGuardar={async () => {
          const b = borrador;
          setGuardando(true);
          setErrorForm(null);
          try {
            await guardarFestivo(token, b.fecha, {
              nombre: b.nombre.trim() || undefined,
              modo: b.modo,
              horaEntrada: b.modo === "HORARIO" ? b.horaEntrada : null,
              horaSalida: b.modo === "HORARIO" ? b.horaSalida : null,
              personas: b.modo !== "NO_SE_LABORA" && b.soloAlgunos ? b.personas : [],
              pagoDoble: b.pagoDoble,
              avisar: b.avisar,
              nota: b.nota.trim() || null,
            });
            setBorrador(null);
            await cargar();
          } catch (e) {
            setErrorForm(unaFrase(formatApiError(e, ERROR_GUARDAR), ERROR_GUARDAR));
          } finally {
            setGuardando(false);
          }
        }}
        onQuitar={
          borrador.existente?.guardado
            ? () =>
                setConfirmar({
                  title: borrador.existente!.origen === "LEY" ? "Volver a «no se labora»" : "Quitar el día",
                  message:
                    borrador.existente!.origen === "LEY"
                      ? `El ${fechaLarga(borrador.fecha)} vuelve a ser descanso para todo el equipo.`
                      : `El ${fechaLarga(borrador.fecha)} deja de ser descanso: se trabaja como cualquier día.`,
                  confirmLabel: borrador.existente!.origen === "LEY" ? "Volver" : "Quitar",
                  danger: borrador.existente!.origen !== "LEY",
                  fn: async () => {
                    try {
                      await quitarFestivo(token, borrador.fecha);
                      setBorrador(null);
                      await cargar();
                    } catch (e) {
                      setErrorForm(unaFrase(formatApiError(e, ERROR_QUITAR), ERROR_QUITAR));
                    }
                  },
                })
            : undefined
        }
        confirmar={confirmar}
        cerrarConfirmar={() => setConfirmar(null)}
      />
    );
  }

  const futuros = datos.items.filter((f) => f.fecha >= datos.hoy);
  const proximo = futuros.find((f) => !f.finDeSemana) ?? futuros[0] ?? null;
  const anio = datos.hoy.slice(0, 4);
  const esteAnio = futuros.filter((f) => f.fecha.startsWith(anio));
  const seLaboran = futuros.filter((f) => !f.finDeSemana && f.modo !== "NO_SE_LABORA");
  const enDias = proximo ? diasEntre(datos.hoy, proximo.fecha) : null;

  return (
    <div className={s.panel}>
      <div className={s.cabeza}>
        <h2 className={s.titulo}>Días festivos</h2>
        {datos.puedeEditar ? (
          <Button
            variant="primary"
            iconStart={<AddOutlinedIcon fontSize="inherit" aria-hidden="true" />}
            onClick={() => setBorrador(borradorDe(null, datos.hoy))}
          >
            Agregar día de la empresa
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className={s.aviso} role="alert">
          {error}
        </p>
      ) : null}

      <Alert tone="info">
        <strong>Los festivos de ley ya vienen cargados (LFT art. 74).</strong> Lo que se marque aquí lo usan la nómina, el
        desempeño y el recordatorio de entrada: nadie queda con falta un día que no se trabaja, y a quien sí trabaja se
        le paga como festivo.
      </Alert>

      <StatRow cols={4} ariaLabel="Resumen de días festivos">
        <Stat
          label="Próximo"
          value={proximo ? fechaCorta(proximo.fecha) : "—"}
          hint={
            proximo
              ? `${proximo.nombre} · ${enDias === 0 ? "hoy" : enDias === 1 ? "mañana" : `en ${enDias} días`} · ${comoSeTrabaja(proximo).toLowerCase()}`
              : "Sin festivos próximos"
          }
        />
        <Stat
          label={`Quedan en ${anio}`}
          value={String(esteAnio.length)}
          hint={`${esteAnio.filter((f) => f.origen === "LEY").length} de ley · ${esteAnio.filter((f) => f.origen === "EMPRESA").length} que da la empresa`}
        />
        <Stat
          label="Se laboran"
          value={String(seLaboran.length)}
          hint={seLaboran[0] ? `${fechaCorta(seLaboran[0].fecha)} · ${quienTrabaja(seLaboran[0]).toLowerCase()}` : "Ninguno por ahora"}
        />
        <Stat label="Aviso al equipo" value={`${DIAS_DE_AVISO} días antes`} hint="Por la app, a quien descansa y a quien le toca" />
      </StatRow>

      <Card aria-label="Días festivos">
        <div className={s.tablaCaja}>
          <table className={s.tabla}>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Día</th>
                <th scope="col">Tipo</th>
                <th scope="col">¿Se labora?</th>
                <th scope="col">Quién trabaja</th>
                <th scope="col">En la nómina</th>
                {datos.puedeEditar ? (
                  <th scope="col">
                    <span className={s.oculto}>Acción</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {porAnio.map(([anioGrupo, lista]) => (
                <FilasDelAnio
                  key={anioGrupo}
                  anio={anioGrupo}
                  lista={lista}
                  hoy={datos.hoy}
                  puedeEditar={datos.puedeEditar}
                  columnas={datos.puedeEditar ? 7 : 6}
                  personaPor={personaPor}
                  onEditar={(f) => setBorrador(borradorDe(f, datos.hoy))}
                />
              ))}
            </tbody>
          </table>
        </div>
        <p className={s.pie}>
          {datos.items.length} días · la jornada electoral (art. 74 fr. IX) se agrega como día de la empresa cuando haya
          una. Cambiar un día lo recalcula en la nómina de esa semana mientras no esté cerrada.
        </p>
      </Card>

      <div className={s.explica}>
        <Card aria-label="Si no se labora">
          <div className={s.explicaCuerpo}>
            <Badge tone="neutral">No se labora</Badge>
            <ul>
              <li>Nómina: «Descanso» pagado, no «Falta».</li>
              <li>Desempeño: no cuenta como día por trabajar.</li>
              <li>La app no deja checar y no hay recordatorio de entrada.</li>
            </ul>
          </div>
        </Card>
        <Card aria-label="Si se labora con horario propio">
          <div className={s.explicaCuerpo}>
            <Badge tone="warning">Se labora con horario propio</Badge>
            <ul>
              <li>Quien trabaja: retardo y recordatorio con ese horario; pago doble.</li>
              <li>Quien no está en la lista descansa, igual que arriba.</li>
              <li>Las horas del festivo no cuentan para el sueldo de la semana: se pagan aparte.</li>
            </ul>
          </div>
        </Card>
        <Card aria-label="Si cae en fin de semana">
          <div className={s.explicaCuerpo}>
            <Badge tone="outline">Cae en fin de semana</Badge>
            <ul>
              <li>Ya es descanso: no cambia nada para el equipo.</li>
              <li>Quien tenga guardia ese día cobra el festivo trabajado.</li>
              <li>Las guardias se programan como siempre, en Guardias.</li>
            </ul>
          </div>
        </Card>
      </div>
    </div>
  );
}

function FilasDelAnio({
  anio,
  lista,
  hoy,
  puedeEditar,
  columnas,
  personaPor,
  onEditar,
}: {
  anio: string;
  lista: Festivo[];
  hoy: string;
  puedeEditar: boolean;
  columnas: number;
  personaPor: Map<number, { nombre: string; avatarUrl: string | null }>;
  onEditar: (f: Festivo) => void;
}) {
  return (
    <>
      <tr className={s.grupo}>
        <th colSpan={columnas} scope="colgroup">
          {anio}
        </th>
      </tr>
      {lista.map((f) => {
        const tono = tonoDe(f);
        const pasado = f.fecha < hoy;
        return (
          <tr key={f.fecha} data-tono={tono} data-pasado={pasado ? "true" : undefined}>
            <td>
              <Ficha fecha={f.fecha} tono={tono} />
            </td>
            <td>
              <span className={s.nombre}>{f.nombre}</span>
              <span className={s.sub}>
                {f.origen === "LEY" ? `LFT art. 74 fr. ${f.fraccion}` : "Lo da la empresa"}
                {f.nota ? ` · ${f.nota}` : ""}
              </span>
            </td>
            <td>
              <Badge size="sm" tone={f.origen === "LEY" ? "info" : "violet"}>
                {f.origen === "LEY" ? "De ley" : "De la empresa"}
              </Badge>
            </td>
            <td>
              <Badge size="sm" tone={tono === "labora" ? "warning" : tono === "finde" ? "outline" : "neutral"}>
                {comoSeTrabaja(f)}
              </Badge>
            </td>
            <td>
              <span className={s.quien}>
                {f.personas.length && !f.finDeSemana && f.modo !== "NO_SE_LABORA" ? (
                  <span className={s.avatares} aria-hidden="true">
                    {f.personas.slice(0, 3).map((id) => (
                      <Avatar key={id} name={personaPor.get(id)?.nombre ?? `#${id}`} avatarUrl={personaPor.get(id)?.avatarUrl} size={26} />
                    ))}
                  </span>
                ) : null}
                {quienTrabaja(f)}
              </span>
            </td>
            <td>{enLaNomina(f)}</td>
            {puedeEditar ? (
              <td className={s.accion}>
                <Button size="sm" variant={tono === "labora" ? "primary" : "secondary"} onClick={() => onEditar(f)}>
                  Editar
                  <span className={s.oculto}> {fechaLarga(f.fecha)}</span>
                </Button>
              </td>
            ) : null}
          </tr>
        );
      })}
    </>
  );
}

function Editor({
  datos,
  borrador: b,
  setBorrador,
  guardando,
  error,
  onCancelar,
  onGuardar,
  onQuitar,
  confirmar,
  cerrarConfirmar,
}: {
  datos: FestivosRango;
  borrador: Borrador;
  setBorrador: (b: Borrador) => void;
  guardando: boolean;
  error: string | null;
  onCancelar: () => void;
  onGuardar: () => void;
  onQuitar?: () => void;
  confirmar: ConfirmState | null;
  cerrarConfirmar: () => void;
}) {
  const cambia = (parcial: Partial<Borrador>) => setBorrador({ ...b, ...parcial });
  const nuevo = b.existente == null;
  const deLey = b.existente?.origen === "LEY";
  const dow = new Date(`${b.fecha}T12:00:00Z`).getUTCDay();
  const finDeSemana = dow === 0 || dow === 6;
  const duracion = duracionHorario(b.horaEntrada, b.horaSalida);
  const total = datos.personas.length;
  const trabajan = finDeSemana || b.modo === "NO_SE_LABORA" ? 0 : b.soloAlgunos ? b.personas.length : total;
  const disponibles = datos.personas.filter((p) => !b.personas.includes(p.id));
  const elegidas = b.personas.map((id) => datos.personas.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  const horarioTexto = b.modo === "HORARIO" ? `De ${b.horaEntrada} a ${b.horaSalida}` : "Cada quien con su horario";
  const avisoDia = sumaDias(b.fecha, -DIAS_DE_AVISO);
  const valido =
    Boolean(b.fecha) &&
    (deLey || b.nombre.trim().length > 0) &&
    (b.modo !== "HORARIO" || duracion != null) &&
    (b.modo === "NO_SE_LABORA" || !b.soloAlgunos || b.personas.length > 0);

  return (
    <div className={s.panel}>
      <div className={s.cabeza}>
        <Button variant="ghost" iconStart={<ArrowBackOutlinedIcon fontSize="inherit" aria-hidden="true" />} onClick={onCancelar}>
          Días festivos
        </Button>
        <h2 className={s.titulo}>{nuevo ? "Agregar día de la empresa" : fechaLarga(b.fecha)}</h2>
        <div className={s.botones}>
          {onQuitar ? (
            <Button variant={deLey ? "secondary" : "danger-ghost"} onClick={onQuitar}>
              {deLey ? "Volver a «no se labora»" : "Quitar el día"}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!valido || guardando} loading={guardando} onClick={onGuardar}>
            Guardar día
          </Button>
        </div>
      </div>

      {error ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}

      <div className={s.editor}>
        <Card aria-label="Cómo se trabaja el día" className={s.forma}>
          <div className={s.formaCuerpo}>
            {nuevo ? (
              <div className={s.campos}>
                <Field label="Fecha" required>
                  <DateInput value={b.fecha} min={datos.hoy} onChange={(e) => cambia({ fecha: e.target.value })} />
                </Field>
                <Field label="Nombre del día" required>
                  <Input
                    value={b.nombre}
                    maxLength={NOMBRE_FESTIVO_MAX}
                    placeholder="Día de Muertos"
                    onChange={(e) => cambia({ nombre: e.target.value })}
                  />
                </Field>
              </div>
            ) : (
              <div className={s.encabezado}>
                <Ficha fecha={b.fecha} tono={finDeSemana ? "finde" : b.modo === "NO_SE_LABORA" ? "descanso" : "labora"} />
                <div>
                  <span className={s.nombreGrande}>{b.existente!.nombre}</span>
                  <span className={s.sub}>
                    {deLey ? `Descanso obligatorio de ley (LFT art. 74 fr. ${b.existente!.fraccion})` : "Lo da la empresa"}
                  </span>
                </div>
                {deLey ? <Badge tone="info">De ley · la fecha no se mueve</Badge> : null}
              </div>
            )}

            <fieldset className={s.grupoCampos} disabled={finDeSemana}>
              <legend className={s.leyenda}>¿Se labora ese día?</legend>
              {finDeSemana ? (
                <p className={s.sub}>Cae en fin de semana: ya es descanso. Quien trabaje necesita una guardia (pestaña Guardias).</p>
              ) : null}
              {(
                [
                  ["NO_SE_LABORA", "No se labora", "Descanso pagado para todos. Nadie checa ni recibe recordatorio de entrada."],
                  ["HORARIO", "Se labora con horario propio", "Medio día u horario corto. El retardo y el recordatorio se miden con este horario."],
                  ["COMPLETA", "Se labora la jornada completa", "Cada quien con su horario de siempre; solo cambia el pago."],
                ] as const
              ).map(([modo, titulo, texto]) => (
                <label key={modo} className={s.opcion} data-elegida={b.modo === modo ? "true" : undefined}>
                  <input type="radio" name="modo" value={modo} checked={b.modo === modo} onChange={() => cambia({ modo })} />
                  <span className={s.opcionTexto}>
                    <span className={s.opcionTitulo}>{titulo}</span>
                    <span className={s.sub}>{texto}</span>
                    {modo === "HORARIO" && b.modo === "HORARIO" ? (
                      <span className={s.horas}>
                        <Field label="Entrada">
                          <Input type="time" value={b.horaEntrada} onChange={(e) => cambia({ horaEntrada: e.target.value })} />
                        </Field>
                        <Field label="Salida">
                          <Input type="time" value={b.horaSalida} onChange={(e) => cambia({ horaSalida: e.target.value })} />
                        </Field>
                        <span className={s.duracion}>
                          {duracion ? (
                            <>
                              <strong>{duracion}</strong> sin comida · tolerancia de siempre
                            </>
                          ) : (
                            "La salida tiene que ser después de la entrada."
                          )}
                        </span>
                      </span>
                    ) : null}
                  </span>
                </label>
              ))}
            </fieldset>

            {b.modo !== "NO_SE_LABORA" && !finDeSemana ? (
              <fieldset className={s.grupoCampos}>
                <legend className={s.leyenda}>¿Quién trabaja?</legend>
                <div className={s.quienOpciones} role="radiogroup" aria-label="Quién trabaja">
                  <label className={s.quienOpcion} data-elegida={!b.soloAlgunos ? "true" : undefined}>
                    <input type="radio" name="quien" checked={!b.soloAlgunos} onChange={() => cambia({ soloAlgunos: false })} />
                    Todo el equipo
                  </label>
                  <label className={s.quienOpcion} data-elegida={b.soloAlgunos ? "true" : undefined}>
                    <input type="radio" name="quien" checked={b.soloAlgunos} onChange={() => cambia({ soloAlgunos: true })} />
                    Solo algunas personas
                  </label>
                </div>
                {b.soloAlgunos ? (
                  <>
                    <ul className={s.chips}>
                      {elegidas.map((p) => (
                        <li key={p.id} className={s.chip}>
                          <Avatar name={p.nombre} avatarUrl={p.avatarUrl} size={28} />
                          <span>{p.nombre}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            icon
                            aria-label={`Quitar a ${p.nombre}`}
                            onClick={() => cambia({ personas: b.personas.filter((id) => id !== p.id) })}
                          >
                            <CloseOutlinedIcon fontSize="small" aria-hidden="true" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                    <Field label="Agregar persona">
                      <Select
                        value=""
                        onChange={(e) => {
                          const id = Number(e.target.value);
                          if (id) cambia({ personas: [...b.personas, id] });
                        }}
                      >
                        <option value="">Elige a quién</option>
                        {disponibles.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre}
                            {p.puesto ? ` · ${p.puesto}` : ""}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <p className={s.sub}>
                      {total - b.personas.length === 1
                        ? "La persona restante descansa ese día."
                        : `Las ${total - b.personas.length} personas restantes descansan ese día.`}
                    </p>
                  </>
                ) : null}
              </fieldset>
            ) : null}

            <div className={s.extras}>
              <Checkbox
                checked={b.pagoDoble}
                onChange={(e) => cambia({ pagoDoble: e.target.checked })}
                label="Pagar como festivo trabajado"
                description="Salario doble además del sueldo del día, para quien trabaje (LFT art. 75). Sale en la nómina de esa semana."
              />
              <Checkbox
                checked={b.avisar}
                onChange={(e) => cambia({ avisar: e.target.checked })}
                label={`Avisar al equipo por la app ${DIAS_DE_AVISO} días antes`}
                description="A quien descansa: «no se labora». A quien le toca: su horario de ese día."
              />
              <Field label="Nota para quien trabaja" optional hint="La ven en el aviso de la app.">
                <Textarea
                  rows={2}
                  value={b.nota}
                  maxLength={NOTA_FESTIVO_MAX}
                  placeholder="Para qué se trabaja ese día"
                  onChange={(e) => cambia({ nota: e.target.value })}
                />
              </Field>
            </div>
          </div>
        </Card>

        <aside className={s.lado} aria-label="Así queda el día">
          <div className={s.resumenOscuro}>
            <span className={s.resumenEtiqueta}>Así queda el {fechaLarga(b.fecha)}</span>
            <span className={s.resumenCifra}>
              {finDeSemana
                ? "Ya es fin de semana"
                : b.modo === "NO_SE_LABORA"
                  ? "Todo el equipo descansa"
                  : `${trabajan} trabajan · ${Math.max(0, total - trabajan)} descansan`}
            </span>
            <span className={s.resumenEtiqueta}>
              {b.modo === "NO_SE_LABORA" || finDeSemana ? "Descanso pagado" : horarioTexto}
              {b.pagoDoble && b.modo !== "NO_SE_LABORA" && !finDeSemana ? " · pago doble" : ""}
              {b.avisar ? ` · aviso el ${fechaCorta(avisoDia)}` : " · sin aviso"}
            </span>
          </div>

          {b.modo !== "NO_SE_LABORA" && !finDeSemana ? (
            <Card aria-label="Trabajan">
              <CardHead title={`Trabajan · ${trabajan}`} />
              <ul className={s.lista}>
                {(b.soloAlgunos ? elegidas : datos.personas).slice(0, 8).map((p) => (
                  <li key={p.id} className={s.persona}>
                    <Avatar name={p.nombre} avatarUrl={p.avatarUrl} size={32} />
                    <span className={s.personaTexto}>
                      <span className={s.nombre}>{p.nombre}</span>
                      <span className={s.sub}>{horarioTexto}</span>
                    </span>
                    {b.pagoDoble ? (
                      <Badge size="sm" tone="warning">
                        Pago doble
                      </Badge>
                    ) : null}
                  </li>
                ))}
                {(b.soloAlgunos ? elegidas : datos.personas).length > 8 ? (
                  <li className={s.sub}>y {(b.soloAlgunos ? elegidas : datos.personas).length - 8} más</li>
                ) : null}
              </ul>
            </Card>
          ) : null}

          <Card aria-label="Descansan">
            <CardHead title={`Descansan · ${Math.max(0, total - trabajan)}`} />
            <p className={s.texto}>
              Descanso pagado. No se les pide checar, no reciben recordatorio de entrada y el día no les baja el desempeño.
            </p>
          </Card>

          <Card aria-label="En la nómina">
            <CardHead title="En el control de nómina" />
            <p className={s.texto}>
              {b.modo === "NO_SE_LABORA" || finDeSemana
                ? "Ese día sale como «Descanso» con el nombre del festivo, no como «Falta»."
                : `Quien trabaja: «Festivo trabajado»${b.modo === "HORARIO" && duracion ? `, ${duracion} esperadas` : ""}${b.pagoDoble ? ", salario doble aparte" : ""}. El resto: «Descanso».`}
            </p>
          </Card>
        </aside>
      </div>

      <ConfirmDialog state={confirmar} onClose={cerrarConfirmar} />
    </div>
  );
}
