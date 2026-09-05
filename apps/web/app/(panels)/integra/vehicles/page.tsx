"use client";

/**
 * Inventario de placas de INTEGRA.
 *
 * Antes esto era una tabla con botones «Edit», «Del», «OK» y «✕» en inglés
 * dentro de un panel en español, y un `confirm("¿Borrar?")` del navegador. Y,
 * peor: `PATCH /integra/vehicles/:id` acepta `personId` desde siempre, pero la
 * pantalla solo mandaba `plateNo`, así que el dueño de una placa no se podía
 * corregir sin borrarla y volverla a crear.
 *
 * El alta del servidor es un `upsert` sobre la placa normalizada: repetir una
 * placa pisa la ficha anterior en silencio. Aquí se detecta antes y se dice.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import DirectionsCarOutlinedIcon from "@mui/icons-material/DirectionsCarOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import FilterAltOffOutlinedIcon from "@mui/icons-material/FilterAltOffOutlined";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";

import ConfirmDialog, { type ConfirmState } from "@/components/ui/ConfirmDialog";
import {
  IgBtn,
  IgEmptyState,
  IgError,
  IgField,
  IgFilters,
  IgNotice,
  IgPage,
  IgPanel,
  IgSkeleton,
  IgSplit,
  IgTable,
  IgToolbar,
} from "../_Console";
import { diagnosticar, pedirIntegra, type Diagnostico } from "../_fallosApi";
import { inputStyle, selectStyle } from "../_lib";
import { useUrlFilters } from "../_useUrlFilters";
import styles from "./_placas.module.css";
import {
  FILTROS_VEHICULOS_INICIALES,
  PLACA_MAX,
  contarSinDueno,
  esFiltroDueno,
  etiquetaPersona,
  filtrarVehiculos,
  hayFiltroVehiculos,
  placaDuplicada,
  resolverDueno,
  validarPlaca,
  type FiltrosVehiculos,
  type PersonaResumen,
  type RespuestaPersonas,
  type RespuestaVehiculos,
  type Vehiculo,
} from "./_placas";

const DEFECTOS_URL: Record<string, string> = { ...FILTROS_VEHICULOS_INICIALES };

function Inventario() {
  const [crudos, setCrudos] = useUrlFilters<Record<string, string>>({ ...DEFECTOS_URL });

  const filtros = useMemo<FiltrosVehiculos>(
    () => ({
      q: crudos.q ?? "",
      dueno: esFiltroDueno(crudos.dueno ?? "") ? (crudos.dueno as FiltrosVehiculos["dueno"]) : "",
    }),
    [crudos],
  );

  const [items, setItems] = useState<Vehiculo[]>([]);
  const [personas, setPersonas] = useState<PersonaResumen[]>([]);
  const [notaSync, setNotaSync] = useState<string | null>(null);
  const [fallo, setFallo] = useState<Diagnostico | null>(null);
  /** El padrón puede fallar sin que falle el inventario: son dos peticiones. */
  const [falloPadron, setFalloPadron] = useState<Diagnostico | null>(null);
  const [primeraCarga, setPrimeraCarga] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // Formulario: `editando` a null es alta; con id es edición.
  const [editando, setEditando] = useState<string | null>(null);
  const [placa, setPlaca] = useState("");
  const [personaId, setPersonaId] = useState("");
  const [tocado, setTocado] = useState(false);

  const [confirmar, setConfirmar] = useState<ConfirmState | null>(null);

  const cargar = useCallback(async () => {
    setOcupado(true);
    setFallo(null);
    try {
      const data = await pedirIntegra<RespuestaVehiculos>("integra/vehicles");
      setItems(Array.isArray(data.items) ? data.items : []);
      setNotaSync(data.syncNote || null);
    } catch (e) {
      setFallo(diagnosticar(e, "cargar el inventario de placas"));
    } finally {
      setOcupado(false);
      setPrimeraCarga(false);
    }

    // El padrón va aparte a propósito: que no haya personas no puede impedir
    // ver ni dar de alta placas.
    setFalloPadron(null);
    try {
      const p = await pedirIntegra<RespuestaPersonas>("integra/people");
      setPersonas(Array.isArray(p.items) ? p.items : []);
    } catch (e) {
      setPersonas([]);
      setFalloPadron(diagnosticar(e, "cargar el padrón de personas"));
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const filtrados = useMemo(() => filtrarVehiculos(items, filtros), [items, filtros]);
  const conFiltro = hayFiltroVehiculos(filtros);
  const sinDueno = useMemo(() => contarSinDueno(items), [items]);

  const validacion = useMemo(() => validarPlaca(placa), [placa]);
  const duplicado = useMemo(
    () => (validacion.valida ? placaDuplicada(validacion.normalizada, items, editando) : null),
    [validacion, items, editando],
  );
  const enEdicion = useMemo(
    () => (editando ? (items.find((v) => v.id === editando) ?? null) : null),
    [editando, items],
  );

  const errorPlaca = validacion.error;
  const errorDuplicado = duplicado
    ? `Ya existe una ficha con esa placa (${duplicado.plate}). Guardarla otra vez no crearía otra: el servidor sobrescribiría la actual, dueño incluido.`
    : null;
  const puedeGuardar = validacion.valida && !duplicado && !guardando;

  const cancelar = useCallback(() => {
    setEditando(null);
    setPlaca("");
    setPersonaId("");
    setTocado(false);
  }, []);

  const empezarEdicion = useCallback((v: Vehiculo) => {
    setEditando(v.id);
    setPlaca(v.plate);
    setPersonaId(v.personId ?? "");
    setTocado(false);
  }, []);

  const guardar = useCallback(async () => {
    if (!puedeGuardar) return;
    setGuardando(true);
    setFallo(null);
    try {
      if (editando) {
        await pedirIntegra(`integra/vehicles/${encodeURIComponent(editando)}`, {
          method: "PATCH",
          // `personId: ""` es lo que el servidor entiende por «quitar dueño»:
          // `personId || null`. Mandar `undefined` dejaría el dueño intacto.
          body: JSON.stringify({ plateNo: validacion.normalizada, personId: personaId }),
        });
      } else {
        await pedirIntegra("integra/vehicles", {
          method: "POST",
          body: JSON.stringify({
            plateNo: validacion.normalizada,
            personId: personaId || undefined,
          }),
        });
      }
      cancelar();
      await cargar();
    } catch (e) {
      setFallo(
        diagnosticar(e, editando ? "guardar los cambios del vehículo" : "dar de alta la placa"),
      );
    } finally {
      setGuardando(false);
    }
  }, [puedeGuardar, editando, validacion.normalizada, personaId, cancelar, cargar]);

  const pedirBorrado = useCallback(
    (v: Vehiculo) => {
      setConfirmar({
        title: "Eliminar placa",
        message: `Se va a eliminar la placa ${v.plate}${
          v.personName ? `, asignada a ${v.personName}` : ""
        }. Esta acción no se puede deshacer.`,
        confirmLabel: "Eliminar placa",
        danger: true,
        fn: async () => {
          setFallo(null);
          try {
            await pedirIntegra(`integra/vehicles/${encodeURIComponent(v.id)}`, {
              method: "DELETE",
            });
            if (editando === v.id) cancelar();
            await cargar();
          } catch (e) {
            setFallo(diagnosticar(e, "eliminar el vehículo"));
          }
        },
      });
    },
    [cargar, cancelar, editando],
  );

  const limpiarFiltros = useCallback(() => setCrudos({ ...DEFECTOS_URL }), [setCrudos]);

  const formulario = (
    <div className={styles.formulario}>
      {enEdicion && (
        <p className={styles.modoEdicion}>
          Editando <span className={styles.modoEdicionPlaca}>{enEdicion.plate}</span>
        </p>
      )}

      <IgField label={`Placa (máx. ${PLACA_MAX})`}>
        <input
          value={placa}
          onChange={(e) => setPlaca(e.target.value)}
          onBlur={() => setTocado(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && puedeGuardar) void guardar();
          }}
          className={styles.placaEntrada}
          style={{ ...inputStyle, maxWidth: "100%" }}
          maxLength={PLACA_MAX}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={tocado && Boolean(errorPlaca || errorDuplicado)}
          aria-describedby="ayuda-placa"
        />
      </IgField>

      <div id="ayuda-placa">
        {tocado && errorPlaca ? (
          <p className={styles.error} role="alert">
            {errorPlaca}
          </p>
        ) : errorDuplicado ? (
          <p className={styles.error} role="alert">
            {errorDuplicado}
          </p>
        ) : validacion.aviso ? (
          <p className={styles.aviso}>{validacion.aviso}</p>
        ) : validacion.valida && validacion.normalizada !== placa ? (
          <p className={styles.pista}>
            Se guardará como{" "}
            <span className={styles.previsualizacion}>{validacion.normalizada}</span>
          </p>
        ) : (
          <p className={styles.pista}>
            Letras, números, espacios y guiones. Se guarda en mayúsculas.
          </p>
        )}
      </div>

      <IgField label="Persona dueña">
        <select
          value={personaId}
          onChange={(e) => setPersonaId(e.target.value)}
          style={{ ...selectStyle, maxWidth: "100%" }}
          disabled={personas.length === 0}
        >
          <option value="">Sin asignar</option>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {etiquetaPersona(p)}
            </option>
          ))}
        </select>
      </IgField>

      {personas.length === 0 && !primeraCarga && (
        <p className={styles.pista}>
          {falloPadron
            ? `${falloPadron.titulo}: puedes guardar la placa, pero no asignarle dueño hasta que cargue el padrón.`
            : "No hay personas dadas de alta en este sitio, así que no hay a quién asignar la placa."}
        </p>
      )}

      <div className={styles.formularioAcciones}>
        <IgBtn variant="primary" disabled={!puedeGuardar} onClick={() => void guardar()}>
          {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Agregar placa"}
        </IgBtn>
        {editando && (
          <IgBtn onClick={cancelar} disabled={guardando}>
            Cancelar
          </IgBtn>
        )}
      </div>
    </div>
  );

  return (
    <IgPage>
      <IgToolbar
        title="Vehículos y placas"
        meta={
          primeraCarga ? (
            "Cargando…"
          ) : (
            <span className={styles.resumen}>
              <span>
                <span className={styles.resumenDato}>{filtrados.length}</span> de{" "}
                <span className={styles.resumenDato}>{items.length}</span> placas
                {conFiltro ? " tras filtrar" : ""}
              </span>
              {sinDueno > 0 && (
                <span>
                  · <span className={styles.resumenDato}>{sinDueno}</span> sin dueño
                </span>
              )}
            </span>
          )
        }
        actions={
          <IgBtn
            onClick={() => void cargar()}
            disabled={ocupado}
            aria-label="Volver a cargar el inventario de placas"
          >
            <RefreshIcon fontSize="small" aria-hidden />
            &nbsp;{ocupado ? "Cargando…" : "Actualizar"}
          </IgBtn>
        }
      />

      {fallo && (
        <IgError
          title={fallo.titulo}
          tone={fallo.tono}
          onRetry={fallo.reintentable ? () => void cargar() : undefined}
          retrying={ocupado}
        >
          {fallo.cuerpo}
        </IgError>
      )}

      {notaSync && <IgNotice tone="warn">{notaSync}</IgNotice>}

      <IgSplit
        leftWidth="32%"
        left={
          <IgPanel title={editando ? "Editar vehículo" : "Alta de placa"}>{formulario}</IgPanel>
        }
        right={
          <IgPanel title="Inventario" count={filtrados.length} flush>
            <IgFilters>
              <IgField label="Buscar">
                <input
                  type="search"
                  value={filtros.q}
                  placeholder="Placa o persona"
                  onChange={(e) => setCrudos({ q: e.target.value })}
                  style={inputStyle}
                />
              </IgField>
              <IgField label="Dueño">
                <select
                  value={filtros.dueno}
                  onChange={(e) => setCrudos({ dueno: e.target.value })}
                  style={selectStyle}
                >
                  <option value="">Todas</option>
                  <option value="con">Con dueño</option>
                  <option value="sin">Sin dueño</option>
                </select>
              </IgField>
              <IgBtn
                onClick={limpiarFiltros}
                disabled={!conFiltro}
                aria-label="Quitar todos los filtros"
              >
                <FilterAltOffOutlinedIcon fontSize="small" aria-hidden />
                &nbsp;Limpiar
              </IgBtn>
            </IgFilters>

            {primeraCarga ? (
              <IgSkeleton variant="row" rows={6} columns={4} label="Cargando las placas…" />
            ) : items.length === 0 && !fallo ? (
              <IgEmptyState
                icon={<DirectionsCarOutlinedIcon fontSize="medium" />}
                title="Todavía no hay ninguna placa registrada"
                description={
                  <>
                    Este es el padrón de vehículos del sitio: sirve para saber de quién es
                    un coche cuando aparece en la caseta o en un evento. Da de alta la
                    primera con el formulario de la izquierda. Ojo: las placas se guardan
                    en NEXARA, no se empujan a las cámaras.
                  </>
                }
              />
            ) : filtrados.length === 0 ? (
              <IgEmptyState
                icon={<FilterAltOffOutlinedIcon fontSize="medium" />}
                title="Ninguna placa cumple este filtro"
                description={`Hay ${items.length} placas registradas, pero ninguna cuadra con lo que has pedido.`}
                action={
                  <IgBtn onClick={limpiarFiltros}>
                    <FilterAltOffOutlinedIcon fontSize="small" aria-hidden />
                    &nbsp;Quitar filtros
                  </IgBtn>
                }
              />
            ) : (
              <IgTable
                columns={[
                  { key: "placa", label: "Placa", width: "150px" },
                  { key: "dueno", label: "Persona dueña" },
                  { key: "id", label: "Identificador", mono: true, width: "190px" },
                  { key: "acc", label: "Acciones", width: "90px", align: "right" },
                ]}
                selectedKey={editando}
                rows={filtrados.map((v) => {
                  const dueno = resolverDueno(v, personas);
                  return {
                    key: v.id,
                    cells: {
                      placa: <span className={styles.placa}>{v.plate}</span>,
                      dueno:
                        dueno.estado === "sin-dueno" ? (
                          <span className={styles.sinDueno}>Sin asignar</span>
                        ) : dueno.estado === "conocido" ? (
                          <span>
                            <PersonOutlineOutlinedIcon
                              fontSize="inherit"
                              aria-hidden
                              style={{ verticalAlign: "-2px", marginRight: 4 }}
                            />
                            {etiquetaPersona(dueno.persona)}
                          </span>
                        ) : (
                          <span className={styles.duenoAusente}>
                            {dueno.nombre || dueno.id}
                            <span className={styles.duenoNota}>
                              {personas.length === 0
                                ? "El padrón no cargó: no se pudo comprobar."
                                : "Ya no está en el padrón de personas del sitio."}
                            </span>
                          </span>
                        ),
                      id: v.id,
                      acc: (
                        <span className={styles.acciones}>
                          <button
                            type="button"
                            className={styles.iconoBtn}
                            onClick={() => empezarEdicion(v)}
                            aria-label={`Editar la placa ${v.plate}`}
                            title={`Editar la placa ${v.plate}`}
                          >
                            <EditOutlinedIcon fontSize="small" aria-hidden />
                          </button>
                          <button
                            type="button"
                            className={`${styles.iconoBtn} ${styles.iconoBtnPeligro}`}
                            onClick={() => pedirBorrado(v)}
                            aria-label={`Eliminar la placa ${v.plate}`}
                            title={`Eliminar la placa ${v.plate}`}
                          >
                            <DeleteOutlineOutlinedIcon fontSize="small" aria-hidden />
                          </button>
                        </span>
                      ),
                    },
                  };
                })}
              />
            )}
          </IgPanel>
        }
      />

      <ConfirmDialog state={confirmar} onClose={() => setConfirmar(null)} />
    </IgPage>
  );
}

export default function IntegraVehiclesPage() {
  return (
    <Suspense
      fallback={
        <IgPage>
          <IgToolbar title="Vehículos y placas" meta="Cargando…" />
          <IgPanel title="Inventario" flush>
            <IgSkeleton variant="row" rows={6} columns={4} label="Cargando las placas…" />
          </IgPanel>
        </IgPage>
      }
    >
      <Inventario />
    </Suspense>
  );
}
