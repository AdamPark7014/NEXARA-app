"use client";

import { useEffect, useMemo, useState } from "react";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import { Badge, Button, DateInput, Input, LinkButton, Switch } from "@/components/base";
import {
  TITULO_TERMINO,
  type ClaveTermino,
  type CotizacionDetalle,
  type PaqueteCotizacion,
} from "@/lib/cotizaciones-api";
import {
  porcentajeMargen,
  sumarDias,
  textoDePorcentaje,
  totalesDePartidas,
  type DocumentoCotizacion,
  type PartidaEditor,
} from "@/lib/cotizacion-documento";
import {
  ENTREGA_POR_OMISION,
  GARANTIA_POR_OMISION,
  fechaCortaMx,
  textoVigenciaPorOmision,
} from "@/lib/cotizacion-personalizacion";
import { Ayuda, Campo, Hoja, Segmentado, TextoAuto } from "./campos";
import TablaPartidas from "./TablaPartidas";
import styles from "./editor.module.css";

type Cambiar = (cambio: (doc: DocumentoCotizacion) => DocumentoCotizacion) => void;

const TERMINOS_EDITABLES: ClaveTermino[] = ["pago", "alcance", "noIncluye", "disponibilidad", "otras"];

const MODALIDAD: Record<string, string> = {
  SUMINISTRO: "Solo suministro: no hay partidas de mano de obra.",
  SUMINISTRO_INSTALACION: "Suministro e instalación: hay mano de obra cobrada (o el segmento la incluye).",
  LICITACION: "Licitación: mandan las bases.",
};

function diasEntre(desde: string, hasta: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return null;
  const dias = Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);
  return dias > 0 ? dias : null;
}

/**
 * 04 Cotización: datos del encabezado (cliente, teléfono, emisión, folio, validez), partidas como
 * hoja de cálculo, totales alineados con la columna Total y términos y condiciones editables.
 */
export default function SeccionCotizacion({
  doc,
  cambiar,
  editable,
  detalle,
  token,
  paquetes,
  onAplicarPaquete,
  onIncluirTerminos,
}: {
  /** Los términos están apagados en «Personalizar»: se ofrece volver a incluirlos. */
  onIncluirTerminos?: () => void;
  doc: DocumentoCotizacion;
  cambiar: Cambiar;
  editable: boolean;
  detalle: CotizacionDetalle | null;
  token: string | null;
  paquetes: PaqueteCotizacion[];
  onAplicarPaquete: (clave: string, cantidad: number) => Promise<void>;
}) {
  const [verPaquetes, setVerPaquetes] = useState(false);
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [aplicando, setAplicando] = useState<string | null>(null);

  const totales = useMemo(
    () => totalesDePartidas(doc.partidas, doc.marginPercent, doc.conIva !== false),
    [doc.partidas, doc.marginPercent, doc.conIva],
  );
  const vigenciaDias = diasEntre(doc.issueDate, doc.validUntil);
  const entregaTexto = doc.opciones.condiciones.tiempoEntrega.trim() || doc.deliveryTime.trim() || ENTREGA_POR_OMISION;
  const garantiaTexto = doc.opciones.condiciones.garantia.trim() || GARANTIA_POR_OMISION;
  const vigenciaTexto =
    doc.opciones.condiciones.vigencia.trim() || textoVigenciaPorOmision(vigenciaDias, fechaCortaMx(doc.validUntil));
  const setCondicion = (clave: "tiempoEntrega" | "garantia" | "vigencia", valor: string) =>
    cambiar((d) => ({
      ...d,
      opciones: { ...d.opciones, condiciones: { ...d.opciones.condiciones, [clave]: valor } },
    }));
  const moneda = doc.moneda;
  const terminosIncluidos = doc.opciones.secciones.terminos;

  const setPartidas = (f: (p: PartidaEditor[]) => PartidaEditor[]) => cambiar((d) => ({ ...d, partidas: f(d.partidas) }));

  const base = (clave: ClaveTermino) => detalle?.terminosBase?.partes?.find((p) => p.clave === clave)?.texto ?? "";
  const esLicitacion = (detalle?.terminos.modalidad ?? "") === "LICITACION" || doc.segmento === "LICITACION";
  // Títulos y orden como los imprime el PDF (en licitación se llaman como en las bases).
  // Tiempo de entrega, garantía y vigencia se editan abajo: ese texto es el del PDF.
  const partesBase = (detalle?.terminosBase?.partes ?? []).filter(
    (p) => p.clave !== "vigencia" && p.clave !== "entrega" && p.clave !== "garantia",
  );
  const tituloDe = (clave: ClaveTermino) => partesBase.find((p) => p.clave === clave)?.titulo ?? TITULO_TERMINO[clave];
  const orden: ClaveTermino[] = [
    ...partesBase.map((p) => p.clave as ClaveTermino),
    ...TERMINOS_EDITABLES.filter((c) => !partesBase.some((p) => p.clave === c)),
  ];
  const validezRapida = [15, 30, 45].map((dias) => ({ valor: sumarDias(doc.issueDate, dias), etiqueta: `${dias} días` }));
  // Con el anticipo en 0 el PDF ya no pone ninguno por su cuenta; lo que quede escrito a mano sí
  // sale tal cual, así que se avisa en el renglón que todavía lo menciona.
  const sinAnticipo = !esLicitacion && Number(doc.depositPercent) === 0;
  const avisoAnticipo = (texto: string) =>
    sinAnticipo && /anticipo/i.test(texto) ? (
      <p className={styles.pistaAviso} role="note">
        El anticipo está en 0 %, pero este texto todavía menciona un anticipo y así saldrá en el PDF.
      </p>
    ) : null;

  return (
    <Hoja
      id="cotizacion"
      numero="04"
      titulo="Cotización"
      descripcion="Datos del cliente, partidas con sus totales y condiciones comerciales."
      ayuda="La hoja de cotización del PDF: datos del cliente, tabla de partidas con subtotal, IVA y total, términos y firma. El folio y la moneda salen de la portada y de Personalizar."
      acciones={
        editable ? (
          <Button
            size="sm"
            iconStart={<Inventory2OutlinedIcon />}
            onClick={() => setVerPaquetes((v) => !v)}
            aria-expanded={verPaquetes}
            disabled={!paquetes.length}
          >
            Paquetes
          </Button>
        ) : null
      }
    >
      <p className={styles.subtitulo}>Cliente y datos de la hoja</p>
      <div className={styles.campos3}>
        <Campo etiqueta="Cliente" htmlFor="cot-cliente-04">
          <Input
            id="cot-cliente-04"
            value={doc.clientName}
            disabled={!editable}
            placeholder="Nombre del cliente"
            onChange={(e) => cambiar((d) => ({ ...d, clientName: e.target.value }))}
          />
        </Campo>
        <Campo etiqueta="Teléfono" htmlFor="cot-telefono">
          <Input
            id="cot-telefono"
            type="tel"
            value={doc.clientPhone}
            disabled={!editable}
            placeholder="222 000 0000"
            onChange={(e) => cambiar((d) => ({ ...d, clientPhone: e.target.value }))}
          />
        </Campo>
        <Campo etiqueta="Empresa" htmlFor="cot-empresa">
          <Input
            id="cot-empresa"
            value={doc.clientCompany}
            disabled={!editable}
            placeholder="Grupo Dice Puebla"
            onChange={(e) => cambiar((d) => ({ ...d, clientCompany: e.target.value }))}
          />
        </Campo>
        <Campo etiqueta="Atención" htmlFor="cot-atencion">
          <Input
            id="cot-atencion"
            value={doc.atencion}
            disabled={!editable}
            placeholder="Eva Benavides"
            onChange={(e) => cambiar((d) => ({ ...d, atencion: e.target.value }))}
          />
        </Campo>
        <Campo etiqueta="Ubicación" htmlFor="cot-ubicacion">
          <Input
            id="cot-ubicacion"
            value={doc.clientAddress}
            disabled={!editable}
            placeholder="Puebla, Pue."
            onChange={(e) => cambiar((d) => ({ ...d, clientAddress: e.target.value }))}
          />
        </Campo>
        <Campo etiqueta="Trabajo" htmlFor="cot-trabajo">
          <Input
            id="cot-trabajo"
            value={doc.trabajo}
            disabled={!editable}
            placeholder="Ventas"
            onChange={(e) => cambiar((d) => ({ ...d, trabajo: e.target.value }))}
          />
        </Campo>
        <Campo etiqueta="Correo" htmlFor="cot-correo">
          <Input
            id="cot-correo"
            type="email"
            value={doc.clientEmail}
            disabled={!editable}
            placeholder="compras@cliente.com"
            onChange={(e) => cambiar((d) => ({ ...d, clientEmail: e.target.value }))}
          />
        </Campo>
        <Campo etiqueta="Fecha de emisión" htmlFor="cot-emision">
          <DateInput
            id="cot-emision"
            value={doc.issueDate}
            disabled={!editable}
            onChange={(e) => cambiar((d) => ({ ...d, issueDate: e.target.value }))}
          />
        </Campo>
        <Campo etiqueta="Cotización N°">
          <span className={`${styles.inputFijo} ${styles.mono}`} title={detalle?.folio}>
            {detalle?.folio ?? "Se emite al guardar"}
          </span>
        </Campo>
        <Campo etiqueta="Validez" htmlFor="cot-validez" className={styles.campoConAtajos}>
          <DateInput
            id="cot-validez"
            value={doc.validUntil}
            min={doc.issueDate}
            disabled={!editable}
            onChange={(e) => cambiar((d) => ({ ...d, validUntil: e.target.value }))}
          />
          {editable ? (
            <Segmentado
              etiqueta="Validez rápida"
              opciones={validezRapida}
              valor={doc.validUntil}
              onValor={(v) => cambiar((d) => ({ ...d, validUntil: v }))}
              chico
            />
          ) : null}
        </Campo>
      </div>

      {verPaquetes && editable ? (
        <div className={styles.panelPlantillas}>
          <div className={styles.panelPlantillasCabeza}>
            <span className={styles.etiquetaConAyuda}>
              <span className={styles.etiqueta}>Paquetes</span>
              <Ayuda titulo="los paquetes">
                Un paquete agrega todas sus partidas y su subsección de alcance, con la cantidad que pongas; si lo
                vuelves a aplicar, se recalcula.
              </Ayuda>
            </span>
            <Button size="sm" variant="ghost" onClick={() => setVerPaquetes(false)}>
              Cerrar
            </Button>
          </div>
          <div className={styles.paquetes}>
            {paquetes.map((paq) => (
              <div key={paq.clave} className={styles.paquete}>
                <strong>{paq.titulo}</strong>
                <p>{paq.descripcion}</p>
                <div className={styles.paqueteFila}>
                  <Input
                    controlSize="sm"
                    className={styles.inputNumero}
                    type="number"
                    min={1}
                    aria-label={`Cantidad de «${paq.titulo}»`}
                    value={cantidades[paq.clave] ?? "1"}
                    onChange={(e) => setCantidades((c) => ({ ...c, [paq.clave]: e.target.value }))}
                  />
                  <Button
                    size="sm"
                    variant="tonal"
                    loading={aplicando === paq.clave}
                    disabled={Boolean(aplicando) || !detalle}
                    onClick={async () => {
                      const n = Math.max(1, Math.round(Number(cantidades[paq.clave] ?? "1") || 1));
                      setAplicando(paq.clave);
                      try {
                        await onAplicarPaquete(paq.clave, n);
                      } finally {
                        setAplicando(null);
                      }
                    }}
                  >
                    {aplicando === paq.clave ? "Agregando…" : "Agregar"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
          {!detalle ? <p className={styles.pista}>Se habilitan al guardarse el borrador.</p> : null}
        </div>
      ) : null}

      <CampoMargen
        valor={doc.marginPercent}
        editable={editable}
        onValor={(marginPercent) => cambiar((d) => ({ ...d, marginPercent }))}
      />
      <Switch
        checked={doc.conIva !== false}
        disabled={!editable}
        onChange={(e) => {
          const conIva = e.target.checked;
          cambiar((d) => ({ ...d, conIva }));
        }}
        label="Requiere factura (lleva IVA)"
        description={
          doc.conIva !== false
            ? "Se suma el IVA de cada partida. Apágalo si el cliente no pide factura."
            : "Sin factura: la cotización sale sin IVA y así se imprime en el PDF."
        }
      />
      {doc.marginPercent != null && doc.marginPercent !== 0 && doc.partidas.some((p) => p.marginPercent != null) ? (
        <p className={styles.pista}>
          Ojo: este margen se suma al de las partidas que ya traen el suyo (abajo, en «Detalle»). Si solo quieres
          controlar el margen partida por partida, deja este campo en 0.
        </p>
      ) : null}

      <div className={styles.bloque}>
        <div className={styles.bloqueCabeza}>
          <span className={styles.etiquetaConAyuda}>
            <span className={styles.subtitulo}>Partidas</span>
            {editable ? (
              <Ayuda titulo="la tabla de partidas">
                Enter agrega una fila (Mayús+Enter, un salto en el título) · Tab cambia de celda · ↑↓ cambian de fila ·
                Retroceso en un título vacío quita la fila. Debajo del título están Marca, Modelo, Costo y Margen %
                de esa partida: con costo y margen puestos ahí, el precio de esa fila sale solo (costo × margen) —
                aparte del margen general de arriba, que sigue yendo sobre el total. La descripción del PDF es el
                recuadro de abajo: crece con el texto y conserva saltos de línea y viñetas. La última fila, mientras
                escribes, te ofrece primero las partidas que ya cotizaste («Usadas antes») y luego el catálogo: una
                usada antes entra con su descripción, marca, modelo, unidad, costo y precio de la última vez, y con
                el margen vacío para que pongas el de esta cotización. El menú ⋯ de cada renglón tiene el grupo
                (equipos, materiales o mano de obra), subir, bajar y quitar.
              </Ayuda>
            ) : null}
          </span>
          {editable && !doc.partidas.length ? (
            <span className={styles.pista}>Escribe la primera partida y presiona Enter</span>
          ) : null}
        </div>
        <TablaPartidas
          partidas={doc.partidas}
          setPartidas={setPartidas}
          editable={editable}
          moneda={moneda}
          token={token}
          totales={totales}
          columnas={doc.opciones.columnas}
          margenPorcentaje={totales.margenPorcentaje}
          margenMonto={totales.margenMonto}
          cotizacionId={detalle?.id ?? null}
        />
      </div>

      <div className={styles.bloque}>
        <div className={styles.bloqueCabeza}>
          <span className={styles.etiquetaConAyuda}>
            <span className={styles.subtitulo}>Términos y condiciones</span>
            <Ayuda titulo="los términos">
              {detalle
                ? `${MODALIDAD[detalle.terminos.modalidad] ?? ""} Cada término viene del segmento, del anticipo y de lo que cobras; si lo reescribes, se queda como lo escribiste («Restablecer» lo devuelve) y si lo dejas vacío no se imprime. La forma de pago es el renglón «Condiciones de pago» del PDF; con anticipo 0 ya no menciona ninguno. El tiempo de entrega, la garantía y la vigencia de abajo son el texto que sale en el PDF.`
                : "Se arman al guardar, según el segmento y lo que cobres."}
            </Ayuda>
          </span>
          {!terminosIncluidos ? (
            <span className={styles.pista}>
              Los términos no van en el PDF. Forma de pago, entrega, garantía y vigencia sí.
            </span>
          ) : null}
          {!terminosIncluidos && editable && onIncluirTerminos ? (
            <Button size="sm" onClick={onIncluirTerminos}>
              Incluir
            </Button>
          ) : null}
        </div>

        <ul className={styles.terminos}>
          {/* La forma de pago es un renglón de las condiciones comerciales del PDF: se edita aunque
              los demás términos estén apagados en «Personalizar». */}
          {detalle
            ? orden.filter((clave) => terminosIncluidos || clave === "pago").map((clave) => {
              const textoBase = base(clave);
              const propio = doc.terminos[clave];
              const editado = propio != null && propio.trim() !== textoBase.trim();
              const valor = propio ?? textoBase;
              if (!editable && !valor.trim()) return null;
              return (
                <li key={clave} className={styles.termino}>
                  <div className={styles.terminoCabeza}>
                    <span className={styles.terminoTitulo}>{tituloDe(clave)}</span>
                    {editado ? (
                      <Badge tone="brand" size="sm">
                        Editado
                      </Badge>
                    ) : null}
                    {clave === "pago" && !esLicitacion ? (
                      <label className={styles.anticipo}>
                        Anticipo
                        <Input
                          controlSize="sm"
                          className={styles.inputNumero}
                          type="number"
                          min={0}
                          max={100}
                          value={doc.depositPercent}
                          disabled={!editable}
                          onChange={(e) => cambiar((d) => ({ ...d, depositPercent: Number(e.target.value) }))}
                        />
                        %
                      </label>
                    ) : null}
                    {editado && editable ? (
                      <LinkButton
                        onClick={() =>
                          cambiar((d) => {
                            const terminos = { ...d.terminos };
                            delete terminos[clave];
                            return { ...d, terminos };
                          })
                        }
                      >
                        Restablecer
                      </LinkButton>
                    ) : null}
                  </div>
                  <TextoAuto
                    value={valor}
                    disabled={!editable}
                    aria-label={tituloDe(clave)}
                    placeholder={clave === "otras" ? "Otra condición" : ""}
                    onValor={(v) =>
                      cambiar((d) => {
                        const terminos = { ...d.terminos };
                        if (v.trim() === textoBase.trim()) delete terminos[clave];
                        else terminos[clave] = v;
                        return { ...d, terminos };
                      })
                    }
                  />
                  {/* Solo en lo reescrito: el texto del segmento se pone al día solo al guardarse. */}
                  {propio != null ? avisoAnticipo(valor) : null}
                </li>
              );
            })
            : null}
            <li className={styles.termino}>
              <div className={styles.terminoCabeza}>
                <span className={styles.terminoTitulo}>Tiempo de entrega</span>
                {doc.opciones.condiciones.tiempoEntrega.trim() ? (
                  <Badge tone="brand" size="sm">
                    Editado
                  </Badge>
                ) : null}
              </div>
              <TextoAuto
                value={entregaTexto}
                disabled={!editable}
                aria-label="Tiempo de entrega"
                onValor={(v) => setCondicion("tiempoEntrega", v)}
              />
              {avisoAnticipo(entregaTexto)}
            </li>
            <li className={styles.termino}>
              <div className={styles.terminoCabeza}>
                <span className={styles.terminoTitulo}>Garantía</span>
                {doc.opciones.condiciones.garantia.trim() ? (
                  <Badge tone="brand" size="sm">
                    Editado
                  </Badge>
                ) : null}
              </div>
              <TextoAuto
                value={garantiaTexto}
                disabled={!editable}
                aria-label="Garantía"
                onValor={(v) => setCondicion("garantia", v)}
              />
              {avisoAnticipo(garantiaTexto)}
            </li>
            <li className={styles.termino}>
              <div className={styles.terminoCabeza}>
                <span className={styles.terminoTitulo}>Vigencia</span>
                {doc.opciones.condiciones.vigencia.trim() ? (
                  <Badge tone="brand" size="sm">
                    Editado
                  </Badge>
                ) : null}
              </div>
              <TextoAuto
                value={vigenciaTexto}
                disabled={!editable}
                aria-label="Vigencia"
                onValor={(v) => setCondicion("vigencia", v)}
              />
            </li>
          </ul>
      </div>
    </Hoja>
  );
}

/**
 * Un solo porcentaje. El texto se queda mientras se escribe («20.») para que el
 * siguiente dígito no se pegue y 20 se vuelva 204. Al salir se ve el número.
 */
function CampoMargen({
  valor,
  editable,
  onValor,
}: {
  valor: number | null;
  editable: boolean;
  onValor: (n: number | null) => void;
}) {
  const [texto, setTexto] = useState(() => textoDePorcentaje(valor));
  const [enfocado, setEnfocado] = useState(false);
  useEffect(() => {
    if (!enfocado) setTexto(textoDePorcentaje(valor));
  }, [valor, enfocado]);

  return (
    <div className={styles.margenCampo}>
      <label className={styles.etiqueta} htmlFor="cot-margen">
        Margen
      </label>
      <span className={styles.margenCaja}>
        <Input
          id="cot-margen"
          className={styles.inputNumero}
          wrapperClassName={styles.margenInput}
          end={<span className={styles.unidad}>%</span>}
          inputMode="decimal"
          autoComplete="off"
          value={texto}
          disabled={!editable}
          placeholder="20"
          aria-label="Porcentaje de margen"
          onFocus={() => setEnfocado(true)}
          onBlur={() => {
            setEnfocado(false);
            setTexto(textoDePorcentaje(valor));
          }}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^\d.,%-]/g, "");
            setTexto(raw);
            if (raw.trim() === "" || raw === "-" || raw === "." || raw === "," || raw === "-." || raw === "-,") {
              onValor(null);
              return;
            }
            const n = porcentajeMargen(raw);
            if (n != null) onValor(n);
          }}
        />
      </span>
    </div>
  );
}
