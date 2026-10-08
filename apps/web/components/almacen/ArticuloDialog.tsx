"use client";

/**
 * Alta y edición de un artículo de almacén con su tipo (Adam, 07-10-2026).
 *
 * El tipo es obligatorio y decide qué más se pide:
 * - Herramienta: no es producto del catálogo; lleva a Herramientas → «Nueva herramienta».
 * - Equipo: por pieza, sin empaque.
 * - Consumible: «Empaque» (bote, bolsa, caja…) y cuántas piezas «Trae».
 * - Por medida: «Presentación» (bobina, rollo, tramo) y cuántos metros «Trae».
 *
 * Las reglas (qué es obligatorio, qué se manda) viven en `lib/tipos-articulo.ts`.
 */
import { useEffect, useId, useState, type FormEvent } from "react";
import Modal from "@/components/ui/Modal";
import { Alert, Button, ButtonLink, Field, FieldGrid, Input } from "@/components/base";
import { useUser } from "@/components/UserContext";
import { toast } from "@/components/Toast";
import { formatApiError } from "@/lib/erp-api";
import { HERRAMIENTAS_PATH } from "@/lib/recursos-core";
import { crearArticulo, editarArticulo, listarEmpaques, servidorGuardaTipo, type ArticuloGuardado } from "@/lib/almacen-api";
import { cantidadLegible } from "@/lib/empaque";
import {
  FORM_ARTICULO_VACIO,
  empaqueDeProducto,
  formArticuloDeProducto,
  metaTipoArticulo,
  previaEmpaque,
  validarArticulo,
  type CampoArticulo,
  type EmpaqueBase,
  type FormArticulo,
  type TipoArticulo,
} from "@/lib/tipos-articulo";
import { SelectorTipoArticulo } from "./TipoArticulo";
import s from "./ArticuloDialog.module.css";

/** Ejemplos del nombre según el tipo: dicen sin explicar qué va en cada uno. */
const EJEMPLO_NOMBRE: Record<TipoArticulo, string> = {
  HERRAMIENTA: "",
  EQUIPO: "Cámara bala 4 MP, monitor 24 in, NVR 8 canales…",
  CONSUMIBLE: "Cincho negro 20 cm, taquete 1/4, clavo 2 in…",
  MEDIDA: "Cable UTP Cat6, tubo conduit 3/4…",
};

/** A dónde va «Herramienta»: el inventario de herramientas con el alta abierta. */
export const ALTA_HERRAMIENTA_HREF = `${HERRAMIENTAS_PATH}?tab=inventory&nueva=1`;

export type ProductoEditable = {
  id: number;
  name: string;
  sku?: string | null;
  category?: string | null;
  tipoArticulo?: string | null;
};

export default function ArticuloDialog({
  open,
  onClose,
  producto,
  empaque,
  categorias = [],
  onGuardado,
}: {
  open: boolean;
  onClose: () => void;
  /** El producto a editar. Sin él es un alta. */
  producto?: ProductoEditable | null;
  /** Su empaque actual, si se conoce (para editarlo). */
  empaque?: EmpaqueBase | null;
  /** Para proponer al escribir la categoría. */
  categorias?: readonly string[];
  onGuardado: (articulo: ArticuloGuardado, modo: "alta" | "editar") => void;
}) {
  const { user } = useUser();
  const token = user?.token ?? "";
  const modo = producto ? "editar" : "alta";
  const ids = {
    tipo: useId(),
    tipoError: useId(),
    sugerencias: useId(),
    categorias: useId(),
  };

  const [inicial, setInicial] = useState<FormArticulo>(FORM_ARTICULO_VACIO);
  const [form, setForm] = useState<FormArticulo>(FORM_ARTICULO_VACIO);
  const [errores, setErrores] = useState<Partial<Record<CampoArticulo, string>>>({});
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Cada vez que se abre arranca de cero (o de lo que tiene el producto). Solo al abrir o
  // al cambiar de producto: un repintado de la pantalla de atrás no borra lo tecleado.
  const apertura = open ? String(producto?.id ?? "nuevo") : null;
  useEffect(() => {
    if (!apertura) return;
    const base = producto ? formArticuloDeProducto(producto, empaque) : FORM_ARTICULO_VACIO;
    setInicial(base);
    setForm(base);
    setErrores({});
    setErrorServidor(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir
  }, [apertura]);

  // Al editar, el empaque se pide aquí: la lista de existencias no siempre lo trae.
  useEffect(() => {
    if (!apertura || !producto || !token || empaque) return;
    let vigente = true;
    void listarEmpaques(token, producto.id)
      .then((lista) => {
        const actual = empaqueDeProducto({ packagings: lista });
        if (!vigente || !actual) return;
        // Si ya empezaron a escribir el empaque, se respeta lo suyo.
        const llenar = (f: FormArticulo): FormArticulo =>
          f.empaqueNombre || f.empaqueCapacidad
            ? f
            : { ...f, empaqueNombre: actual.nombre, empaqueCapacidad: cantidadLegible(Number(actual.piezasPorUnidad)) };
        setInicial(llenar);
        setForm(llenar);
      })
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir
  }, [apertura, token]);

  const meta = metaTipoArticulo(form.tipo);
  const esHerramienta = form.tipo === "HERRAMIENTA";
  const unidad = meta?.unidad ?? "pz";
  const previa = meta?.empaque ? previaEmpaque(form.empaqueNombre, form.empaqueCapacidad, unidad) : null;
  const sucio = JSON.stringify(form) !== JSON.stringify(inicial);

  const cambiar = <K extends keyof FormArticulo>(campo: K, valor: FormArticulo[K]) => {
    setForm((f) => ({ ...f, [campo]: valor }));
    if (campo in errores) setErrores((e) => ({ ...e, [campo]: undefined }));
  };

  const guardar = async (e?: FormEvent) => {
    e?.preventDefault();
    if (guardando || esHerramienta) return;
    const r = validarArticulo(form, modo);
    if (!r.ok) {
      setErrores(r.errores);
      return;
    }
    if (!token) return;
    setGuardando(true);
    setErrorServidor(null);
    try {
      const guardado = producto
        ? await editarArticulo(token, producto.id, r.payload)
        : await crearArticulo(token, r.payload);
      if (!servidorGuardaTipo(guardado)) {
        toast.warning({
          title: modo === "alta" ? "Artículo dado de alta sin tipo" : "Cambios guardados sin el tipo",
          message: "El servidor todavía no guarda el tipo ni el empaque. Edítalo de nuevo cuando se actualice.",
        });
      } else {
        toast.success(modo === "alta" ? `«${guardado.name}» dado de alta` : "Artículo actualizado");
      }
      onGuardado(guardado, modo);
    } catch (err) {
      setErrorServidor(formatApiError(err, modo === "alta" ? "No se pudo dar de alta el artículo" : "No se pudo guardar el artículo"));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      dirty={sucio && !guardando}
      title={modo === "alta" ? "Nuevo artículo" : "Editar artículo"}
      description={modo === "alta" ? "Elige qué es: de eso depende cómo se cuenta." : undefined}
      maxWidth={640}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          {esHerramienta ? (
            <ButtonLink variant="primary" href={ALTA_HERRAMIENTA_HREF} onClick={onClose}>
              Ir a Nueva herramienta
            </ButtonLink>
          ) : (
            <Button variant="primary" onClick={() => void guardar()} loading={guardando}>
              {modo === "alta" ? "Dar de alta" : "Guardar cambios"}
            </Button>
          )}
        </>
      }
    >
      <form className={s.form} onSubmit={(e) => void guardar(e)} noValidate>
        <div className={s.tipo} role="group" aria-labelledby={ids.tipo}>
          <span id={ids.tipo} className={s.rotulo}>
            Tipo de artículo
            <span className={s.obligatorio} aria-hidden="true">
              {" "}
              *
            </span>
          </span>
          <SelectorTipoArticulo
            value={form.tipo}
            onChange={(tipo) => cambiar("tipo", tipo)}
            deshabilitados={producto ? ["HERRAMIENTA"] : []}
            invalid={Boolean(errores.tipo)}
            describedBy={errores.tipo ? ids.tipoError : undefined}
            ariaLabel="Tipo de artículo"
          />
          {errores.tipo ? (
            <span id={ids.tipoError} role="alert" className={s.error}>
              {errores.tipo}
            </span>
          ) : meta ? (
            <span className={s.ayuda}>{meta.ayuda}</span>
          ) : null}
        </div>

        {esHerramienta ? (
          <Alert tone="info" title="Las herramientas se dan de alta en Herramientas">
            Una por una, con su serie, fotos y etiqueta, porque se prestan y regresan.
          </Alert>
        ) : (
          <>
            {errorServidor ? (
              <Alert tone="danger" role="alert">
                {errorServidor}
              </Alert>
            ) : null}
            <FieldGrid>
              <Field label="Nombre" required fullWidth error={errores.nombre}>
                <Input
                  value={form.nombre}
                  onChange={(e) => cambiar("nombre", e.target.value)}
                  placeholder={form.tipo ? EJEMPLO_NOMBRE[form.tipo] : "Qué es, como lo pide la gente"}
                  maxLength={200}
                  autoComplete="off"
                />
              </Field>
              <Field
                label="SKU"
                optional={modo === "alta"}
                hint={modo === "alta" ? "Si lo dejas vacío se genera solo." : "El SKU no se cambia."}
              >
                <Input
                  value={form.sku}
                  onChange={(e) => cambiar("sku", e.target.value)}
                  placeholder={modo === "alta" ? "SKU-0001" : undefined}
                  disabled={modo === "editar"}
                  autoCapitalize="characters"
                  autoComplete="off"
                />
              </Field>
              <Field label="Categoría" optional>
                <Input
                  value={form.categoria}
                  onChange={(e) => cambiar("categoria", e.target.value)}
                  list={categorias.length ? ids.categorias : undefined}
                  placeholder="Fijación, Cableado, CCTV…"
                  autoComplete="off"
                />
              </Field>

              {meta?.empaque ? (
                <>
                  <Field label={meta.empaque.campo} optional error={errores.empaqueNombre}>
                    <Input
                      value={form.empaqueNombre}
                      onChange={(e) => cambiar("empaqueNombre", e.target.value)}
                      list={ids.sugerencias}
                      placeholder={meta.empaque.ejemplo}
                      maxLength={60}
                      autoComplete="off"
                    />
                  </Field>
                  <Field
                    label="Trae"
                    optional
                    error={errores.empaqueCapacidad}
                    hint={unidad === "m" ? "Cuántos metros trae cada una." : "Cuántas piezas trae cada uno."}
                    valid={previa}
                  >
                    <Input
                      value={form.empaqueCapacidad}
                      onChange={(e) => cambiar("empaqueCapacidad", e.target.value)}
                      inputMode="decimal"
                      placeholder={unidad === "m" ? "305" : "100"}
                      end={<span className={s.unidad}>{unidad}</span>}
                      autoComplete="off"
                    />
                  </Field>
                </>
              ) : null}
            </FieldGrid>

            {form.tipo === "EQUIPO" ? (
              <p className={s.nota}>Se cuenta por pieza y no lleva empaque.</p>
            ) : null}
          </>
        )}

        {meta?.empaque ? (
          <datalist id={ids.sugerencias}>
            {meta.empaque.sugerencias.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        ) : null}
        {categorias.length ? (
          <datalist id={ids.categorias}>
            {categorias.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        ) : null}
      </form>
    </Modal>
  );
}
