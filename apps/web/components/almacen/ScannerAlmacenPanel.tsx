"use client";

/**
 * Almacén por código de barras. El lector USB es un teclado: una ráfaga rápida de
 * teclas + Enter es un escaneo (`useLectorDeCodigos`), esté o no el foco en el campo.
 *
 * - Código conocido → aparece el producto y el operador dice qué pasó y cuántas.
 * - Código desconocido → se ofrece darlo de alta (con los datos del catálogo
 *   internacional si es un UPC/EAN) o ligarlo a un producto que ya existe.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@/components/UserContext";
import { createStockMovement, listWarehouses } from "@/lib/stock-api";
import { listCatalogProducts, type CatalogProduct } from "@/lib/catalog-api";
import { formatApiError } from "@/lib/erp-api";
import {
  altaProductoPorCodigo,
  asignarCodigoAProducto,
  buscarPorCodigoDeBarras,
  consultarUpcInternacional,
  type HallazgoDeCodigo,
} from "@/lib/almacen-api";
import {
  clasificarCodigo,
  esConsultableInternacional,
  motivoCodigoInvalido,
  nombreDeTipoCodigo,
  type TipoCodigo,
} from "@/lib/codigo-barras";
import { ATRIBUTO_CAMPO_LECTOR, useLectorDeCodigos } from "@/lib/lector-codigos";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHead,
  EmptyState,
  Field,
  FieldGrid,
  Input,
  Select,
  Textarea,
} from "@/components/base";
import { CampoEscaneo, TarjetaHallazgo, claseMono } from "./PiezasAlmacen";
import s from "./ScannerAlmacenPanel.module.css";

type OpType = "RECEIPT" | "DISPATCH" | "TRANSFER" | "ADJUSTMENT" | "ADJUSTMENT_OUT" | "RETURN";

/**
 * Lo que queda escrito en la nota del movimiento. No se toca: cambiarlo
 * dejaría el historial con dos formas de nombrar la misma operación.
 */
const OP_LABELS: Record<OpType, string> = {
  RECEIPT: "Entrada (recepción)",
  DISPATCH: "Salida (despacho)",
  TRANSFER: "Traspaso",
  ADJUSTMENT: "Ajuste (alta)",
  ADJUSTMENT_OUT: "Ajuste (baja)",
  RETURN: "Devolución",
};

/** Lo que lee el operador. Sin paréntesis ni sinónimos: qué le pasa al stock. */
const OP_UI: Record<OpType, string> = {
  RECEIPT: "Entra material",
  DISPATCH: "Sale material",
  TRANSFER: "Se mueve de almacén",
  ADJUSTMENT: "Ajuste: sobra",
  ADJUSTMENT_OUT: "Ajuste: falta",
  RETURN: "Devuelven material",
};

/** Longitud mínima del código para buscarlo. */
const MIN_SCAN_LEN = 3;

/** El error va atado al campo del código: sin esto se anuncia suelto. */
const ERROR_ID = "escaner-almacen-error";

/** Marca del campo que el lector puede tomar aunque tenga el foco. */
const CAMPO_LECTOR = { [ATRIBUTO_CAMPO_LECTOR]: "" };

/** Se usa de pie, con guantes o en tableta: todos los controles van a 44 px (`lg`). */
const TACTIL = "lg" as const;

type Desconocido = { codigo: string; tipo: TipoCodigo };
type ModoDesconocido = "elegir" | "alta" | "ligar";

const ALTA_VACIA = { name: "", marca: "", modelo: "", descripcion: "", imagenUrl: "", categoria: "" };

export default function ScannerAlmacenPanel() {
  const { user } = useUser();
  const token = user?.token ?? "";
  const inputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [hit, setHit] = useState<HallazgoDeCodigo | null>(null);
  const [warehouses, setWarehouses] = useState<Array<{ id: number; name: string }>>([]);
  const [opType, setOpType] = useState<OpType>("RECEIPT");
  const [fromWarehouseId, setFromWarehouseId] = useState<number | "">("");
  const [toWarehouseId, setToWarehouseId] = useState<number | "">("");
  const [qty, setQty] = useState("1");

  // Código que el almacén no conoce: alta o liga.
  const [desconocido, setDesconocido] = useState<Desconocido | null>(null);
  const [modo, setModo] = useState<ModoDesconocido>("elegir");
  const [alta, setAlta] = useState(ALTA_VACIA);
  const [notaUpc, setNotaUpc] = useState<string | null>(null);
  const [consultando, setConsultando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [candidatos, setCandidatos] = useState<CatalogProduct[]>([]);
  const [buscandoProducto, setBuscandoProducto] = useState(false);

  useEffect(() => {
    busyRef.current = loading || saving;
  }, [loading, saving]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!token) return;
    void listWarehouses(token)
      .then((rows) => {
        const list = rows.map((w) => ({ id: w.id, name: w.name }));
        setWarehouses(list);
        if (list[0]) {
          setFromWarehouseId(list[0].id);
          setToWarehouseId(list[0].id);
        }
      })
      .catch(() => setWarehouses([]));
  }, [token]);

  const needsFrom =
    opType === "DISPATCH" || opType === "TRANSFER" || opType === "ADJUSTMENT_OUT";
  const needsTo =
    opType === "RECEIPT" || opType === "TRANSFER" || opType === "ADJUSTMENT" || opType === "RETURN";

  const cerrarDesconocido = useCallback(() => {
    setDesconocido(null);
    setModo("elegir");
    setAlta(ALTA_VACIA);
    setNotaUpc(null);
    setBusqueda("");
    setCandidatos([]);
  }, []);

  const buscarCodigo = useCallback(
    async (raw: string) => {
      const { codigo: q, tipo } = clasificarCodigo(raw);
      if (!q || !token || busyRef.current) return;
      if (q.length < MIN_SCAN_LEN) {
        setError(`Código demasiado corto (mín. ${MIN_SCAN_LEN})`);
        return;
      }
      setLoading(true);
      setError(null);
      setOkMsg(null);
      setHit(null);
      cerrarDesconocido();
      // Cada código empieza en una unidad: lo que hubiera en «Cantidad» era del anterior
      // (o lo que el lector tecleó ahí si el foco estaba en ese campo).
      setQty("1");
      try {
        const hallazgo = await buscarPorCodigoDeBarras(token, q);
        if (hallazgo) setHit(hallazgo);
        else setDesconocido({ codigo: q, tipo });
        setCode("");
      } catch (e) {
        setError(formatApiError(e, "No se pudo buscar el código. Intenta de nuevo."));
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    [token, cerrarDesconocido],
  );

  // El lector dispara aunque nadie haya hecho clic en el campo. Siempre encendido: así
  // su Enter nunca «pulsa» un botón de la pantalla; lo que se decide aquí es si se atiende.
  useLectorDeCodigos({
    onEscaneo: (codigo) => {
      if (desconocido && modo !== "elegir") {
        // A medio capturar un alta, otro escaneo borraría lo tecleado. Volver a
        // disparar sobre el mismo código no es un error: simplemente no hace nada.
        if (clasificarCodigo(codigo).codigo !== desconocido.codigo) {
          setError("Termina o cancela lo que estás capturando antes de escanear otro código.");
        }
        return;
      }
      void buscarCodigo(codigo);
    },
  });

  const confirmarMovimiento = async () => {
    if (!hit || !token) return;
    const quantity = Number(qty);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Indica una cantidad válida");
      return;
    }
    if (needsFrom && fromWarehouseId === "") {
      setError("Indica el almacén de origen");
      return;
    }
    if (needsTo && toWarehouseId === "") {
      setError("Indica el almacén de destino");
      return;
    }
    if (opType === "TRANSFER" && fromWarehouseId === toWarehouseId) {
      setError("Origen y destino deben ser distintos");
      return;
    }

    setSaving(true);
    setError(null);
    setOkMsg(null);
    try {
      const apiType = opType === "ADJUSTMENT_OUT" ? "ADJUSTMENT" : opType;
      const payload: Parameters<typeof createStockMovement>[1] = {
        type: apiType,
        productId: hit.product.id,
        quantity,
        packagingId: hit.match === "empaque" ? hit.packaging.id : undefined,
        cantidadCapturada: hit.match === "empaque" ? quantity : undefined,
        unidadCaptura: hit.match === "empaque" ? hit.packaging.nombre : undefined,
        notes: `Escáner HID · ${hit.codigoBarras} · ${OP_LABELS[opType]}`,
        reference: hit.codigoBarras,
      };
      if (needsFrom) payload.fromWarehouseId = Number(fromWarehouseId);
      if (needsTo) payload.toWarehouseId = Number(toWarehouseId);

      await createStockMovement(token, payload);
      setOkMsg(`${OP_UI[opType]}: ${hit.product.name}`);
      setHit(null);
      setQty("1");
    } catch (e) {
      setError(formatApiError(e, "No se pudo registrar el movimiento"));
    } finally {
      setSaving(false);
      inputRef.current?.focus();
    }
  };

  // ── Código desconocido: alta ──────────────────────────────────────

  const abrirAlta = async () => {
    if (!desconocido || !token) return;
    setModo("alta");
    setNotaUpc(null);
    // Solo un UPC/EAN de verdad se pregunta fuera; lo demás se captura a mano.
    if (!esConsultableInternacional(desconocido.codigo)) return;
    setConsultando(true);
    const r = await consultarUpcInternacional(token, desconocido.codigo);
    setConsultando(false);
    if (r.encontrado) {
      // Solo rellena lo que siga vacío: no pisa lo que la persona ya tecleó.
      setAlta((a) => ({
        name: a.name || r.producto.nombre || "",
        marca: a.marca || r.producto.marca || "",
        modelo: a.modelo || r.producto.modelo || "",
        descripcion: a.descripcion || r.producto.descripcion || "",
        imagenUrl: a.imagenUrl || r.producto.imagenUrl || "",
        categoria: a.categoria || r.producto.categoria || "",
      }));
      setNotaUpc("Datos sugeridos por el catálogo internacional. Revísalos antes de guardar.");
    } else {
      setNotaUpc(r.mensaje);
    }
  };

  const guardarAlta = async () => {
    if (!desconocido || !token) return;
    if (!alta.name.trim()) {
      setError("Escribe el nombre del producto");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const producto = await altaProductoPorCodigo(token, {
        codigo: desconocido.codigo,
        name: alta.name.trim(),
        marca: alta.marca.trim() || undefined,
        modelo: alta.modelo.trim() || undefined,
        descripcion: alta.descripcion.trim() || undefined,
        imagenUrl: alta.imagenUrl.trim() || undefined,
        categoria: alta.categoria.trim() || undefined,
      });
      // Recién dado de alta, lo normal es que esté entrando: queda listo para la entrada.
      setHit({ match: "producto", codigoBarras: desconocido.codigo, product: producto, existencias: [] });
      setOpType("RECEIPT");
      setOkMsg(`Producto dado de alta con la clave ${producto.sku}. Registra cuántas piezas entran.`);
      cerrarDesconocido();
    } catch (e) {
      setError(formatApiError(e, "No se pudo dar de alta el producto"));
    } finally {
      setSaving(false);
    }
  };

  // ── Código desconocido: ligar a un producto que ya existe ─────────

  useEffect(() => {
    if (modo !== "ligar" || !token) return;
    const q = busqueda.trim();
    if (q.length < 2) {
      setCandidatos([]);
      return;
    }
    let vigente = true;
    setBuscandoProducto(true);
    const espera = setTimeout(() => {
      listCatalogProducts(token, { q, take: 8 })
        .then((r) => {
          if (vigente) setCandidatos(r.data ?? []);
        })
        .catch(() => {
          if (vigente) setCandidatos([]);
        })
        .finally(() => {
          if (vigente) setBuscandoProducto(false);
        });
    }, 280);
    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [busqueda, modo, token]);

  const ligar = async (producto: CatalogProduct) => {
    if (!desconocido || !token) return;
    setSaving(true);
    setError(null);
    try {
      const actualizado = await asignarCodigoAProducto(token, producto.id, {
        codigo: desconocido.codigo,
      });
      setHit({
        match: "producto",
        codigoBarras: desconocido.codigo,
        product: actualizado,
        existencias: [],
      });
      setOkMsg(`Código ligado a ${actualizado.name}. Desde ahora el lector lo reconoce.`);
      cerrarDesconocido();
    } catch (e) {
      setError(formatApiError(e, "No se pudo ligar el código al producto"));
    } finally {
      setSaving(false);
    }
  };

  const confirmDisabled =
    saving ||
    (needsFrom && fromWarehouseId === "") ||
    (needsTo && toWarehouseId === "") ||
    (opType === "TRANSFER" && fromWarehouseId !== "" && fromWarehouseId === toWarehouseId);

  const motivoNoGuardable = desconocido ? motivoCodigoInvalido(desconocido.codigo) : null;
  const existencias = hit?.existencias ?? [];

  return (
    <Card aria-label="Escanear">
      <CardHead
        title="Escanear"
        subtitle="Dispara el lector sobre el código, sin hacer clic en ningún campo. El producto aparece abajo y ahí decides qué pasó con él."
      />
      <div className={s.cuerpo}>
        <CampoEscaneo
          ref={inputRef}
          {...CAMPO_LECTOR}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onBuscar={() => {
            if (busyRef.current) return;
            void buscarCodigo(code);
          }}
          placeholder="Código de barras…"
          aria-label="Código de barras"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? ERROR_ID : undefined}
          autoFocus
          disabled={loading || saving}
          buscando={loading}
          botonDeshabilitado={!code.trim() || saving}
          // Con un producto en pantalla, el primario es registrar: buscar pasa a secundario.
          botonVariante={hit || desconocido ? "secondary" : "primary"}
          lectorActivo={!loading && !saving}
        />

        {error && (
          <div id={ERROR_ID}>
            <Alert tone="danger" role="alert" onDismiss={() => setError(null)}>
              {error}
            </Alert>
          </div>
        )}
        {okMsg && (
          <Alert tone="success" role="status" onDismiss={() => setOkMsg(null)}>
            {okMsg}
          </Alert>
        )}

        {desconocido ? (
          <TarjetaHallazgo
            tono="warning"
            ariaLabel="Código sin dar de alta"
            foto={modo === "alta" ? alta.imagenUrl || null : null}
            eyebrow="Código nuevo"
            titulo="Este código no está dado de alta"
            meta={
              <>
                {nombreDeTipoCodigo(desconocido.tipo)} · <code className={claseMono}>{desconocido.codigo}</code>
              </>
            }
            acciones={
              motivoNoGuardable ? (
                <Button variant="ghost" size={TACTIL} onClick={cerrarDesconocido}>
                  Cancelar
                </Button>
              ) : modo === "elegir" ? (
                <>
                  <Button variant="ghost" size={TACTIL} onClick={cerrarDesconocido}>
                    Cancelar
                  </Button>
                  <Button variant="secondary" size={TACTIL} onClick={() => setModo("ligar")}>
                    Es un producto que ya tengo
                  </Button>
                  <Button variant="primary" size={TACTIL} onClick={() => void abrirAlta()}>
                    Dar de alta este producto
                  </Button>
                </>
              ) : modo === "alta" ? (
                <>
                  <Button variant="ghost" size={TACTIL} onClick={cerrarDesconocido} disabled={saving}>
                    Cancelar
                  </Button>
                  <Button
                    variant="primary"
                    size={TACTIL}
                    onClick={() => void guardarAlta()}
                    loading={saving}
                    disabled={!alta.name.trim()}
                  >
                    Dar de alta
                  </Button>
                </>
              ) : (
                <Button variant="ghost" size={TACTIL} onClick={() => setModo("elegir")} disabled={saving}>
                  Volver
                </Button>
              )
            }
          >
            {motivoNoGuardable ? (
              <Alert tone="warning">{motivoNoGuardable}</Alert>
            ) : modo === "alta" ? (
              // Sin <form>: si el lector dispara con el foco en un campo, su Enter no
              // debe guardar el alta a medias. Se guarda solo con el botón.
              <div className={s.bloque}>
                {(consultando || notaUpc) && (
                  <p role="status" className={s.nota}>
                    {consultando ? "Buscando el código en el catálogo internacional…" : notaUpc}
                  </p>
                )}
                <FieldGrid>
                  <Field label="Nombre del producto" required fullWidth>
                    <Input
                      controlSize={TACTIL}
                      value={alta.name}
                      onChange={(e) => setAlta((a) => ({ ...a, name: e.target.value }))}
                      autoFocus
                    />
                  </Field>
                  <Field label="Marca" optional>
                    <Input controlSize={TACTIL} value={alta.marca} onChange={(e) => setAlta((a) => ({ ...a, marca: e.target.value }))} />
                  </Field>
                  <Field label="Modelo" optional>
                    <Input controlSize={TACTIL} value={alta.modelo} onChange={(e) => setAlta((a) => ({ ...a, modelo: e.target.value }))} />
                  </Field>
                  <Field label="Categoría" optional>
                    <Input controlSize={TACTIL} value={alta.categoria} onChange={(e) => setAlta((a) => ({ ...a, categoria: e.target.value }))} />
                  </Field>
                  <Field label="Descripción" optional fullWidth>
                    <Textarea rows={2} value={alta.descripcion} onChange={(e) => setAlta((a) => ({ ...a, descripcion: e.target.value }))} />
                  </Field>
                </FieldGrid>
              </div>
            ) : modo === "ligar" ? (
              <div className={s.bloque}>
                <Input
                  controlSize={TACTIL}
                  iconStart={<SearchOutlined fontSize="small" />}
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Busca el producto por nombre o clave"
                  aria-label="Busca el producto por nombre o clave"
                  autoFocus
                />
                {buscandoProducto && (
                  <p role="status" className={s.nota}>
                    Buscando…
                  </p>
                )}
                {!buscandoProducto && busqueda.trim().length >= 2 && candidatos.length === 0 && (
                  <p className={s.nota}>Ningún producto coincide. Puedes darlo de alta.</p>
                )}
                {candidatos.length > 0 && (
                  <ul className={s.candidatos}>
                    {candidatos.map((p) => (
                      <li key={p.id} className={s.candidato}>
                        <span className={s.candidatoTexto}>
                          <span className={s.candidatoNombre}>{p.name}</span>
                          <span className={s.candidatoClave}>Clave {p.sku}</span>
                        </span>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={saving}
                          aria-label={`Ligar el código a ${p.name}`}
                          onClick={() => void ligar(p)}
                        >
                          Ligar a este
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className={s.nota}>
                Dalo de alta con sus datos (si es un UPC o EAN se buscan solos) o lígalo a un producto que ya existe.
              </p>
            )}
          </TarjetaHallazgo>
        ) : hit ? (
          // El hallazgo no va en una caja verde: el producto ya es el protagonista
          // y el color se reserva para lo que pide acción o salió mal.
          <TarjetaHallazgo
            ariaLabel="Producto escaneado"
            foto={hit.product.imageUrl}
            eyebrow="Producto encontrado"
            titulo={hit.product.name}
            meta={
              <>
                Clave {hit.product.sku} · código <code className={claseMono}>{hit.codigoBarras}</code>
                {hit.match === "empaque"
                  ? ` · ${hit.packaging.nombre} de ${hit.packaging.piezasPorUnidad} piezas`
                  : ""}
              </>
            }
            insignias={
              existencias.length > 0 ? (
                <>
                  <span className={s.hay}>Hay</span>
                  {existencias.map((e) => (
                    <Badge key={e.warehouseId} tone="brand" size="sm">
                      {e.cantidad} en {e.almacen}
                    </Badge>
                  ))}
                </>
              ) : (
                <Badge tone="neutral" size="sm" dot>
                  Sin existencia registrada
                </Badge>
              )
            }
            acciones={
              <>
                <Button variant="ghost" size={TACTIL} onClick={() => setHit(null)} disabled={saving}>
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  size={TACTIL}
                  onClick={() => void confirmarMovimiento()}
                  disabled={confirmDisabled}
                  loading={saving}
                >
                  Registrar movimiento
                </Button>
              </>
            }
          >
            <FieldGrid>
              <Field label="Qué pasó">
                <Select controlSize={TACTIL} value={opType} onChange={(e) => setOpType(e.target.value as OpType)}>
                  {(Object.keys(OP_UI) as OpType[]).map((k) => (
                    <option key={k} value={k}>
                      {OP_UI[k]}
                    </option>
                  ))}
                </Select>
              </Field>

              {needsFrom && (
                <Field label="Sale de">
                  <Select
                    controlSize={TACTIL}
                    value={fromWarehouseId}
                    onChange={(e) => setFromWarehouseId(e.target.value ? Number(e.target.value) : "")}
                  >
                    <option value="">Elige almacén…</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}

              {needsTo && (
                <Field label="Entra a">
                  <Select
                    controlSize={TACTIL}
                    value={toWarehouseId}
                    onChange={(e) => setToWarehouseId(e.target.value ? Number(e.target.value) : "")}
                  >
                    <option value="">Elige almacén…</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}

              <Field label="Cantidad" hint={hit.match === "empaque" ? hit.packaging.nombre : undefined}>
                {/* También es campo del lector: si disparan con el foco aquí, el código
                    no se queda escrito como cantidad; se busca el producto siguiente. */}
                <Input
                  {...CAMPO_LECTOR}
                  controlSize={TACTIL}
                  className={s.cantidad}
                  type="number"
                  min={0.001}
                  step="any"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
              </Field>
            </FieldGrid>
          </TarjetaHallazgo>
        ) : okMsg ? null : (
          // Tras registrar un movimiento manda el aviso de «listo», no este hueco.
          <EmptyState
            size="compact"
            icon={<SearchOutlined />}
            title="Nada escaneado todavía"
            description="Dispara el lector sobre el código de barras, o tecléalo y pulsa Buscar."
          />
        )}
      </div>
    </Card>
  );
}
