"use client";

import { useRef, useState } from "react";
import Button from "@/components/ui/Button";
import InlineAlert from "@/components/ui/InlineAlert";
import Modal from "@/components/ui/Modal";
import { formatApiError } from "@/lib/erp-api";
import { confirmarImportPersonal, previewImportPersonal } from "@/lib/hr-expediente-api";
import { toast } from "@/components/Toast";
import Link from "next/link";

type Preview = {
  totalFilas: number;
  seActualiza: Array<{
    userId: number;
    nombre: string;
    employeeNumber: string | null;
    fila: Record<string, unknown>;
    cambios: Array<{ campo: string; actual: string | null; excel: string | null }>;
  }>;
  noEstaEnPlataforma: Array<{
    fila: number;
    nombre?: string | null;
    correo?: string | null;
    idNex?: string | null;
    puesto?: string | null;
  }>;
  bajaEnExcelActivoEnPlataforma: Array<{
    userId: number;
    nombre: string;
    employeeNumber: string | null;
    fila: { fechaBaja?: string | null; motivoBaja?: string | null };
  }>;
  nota?: string;
};

const campos: Record<string, string> = {
  employeeNumber: "Número NEX", nombre: "Nombre", puesto: "Puesto", area: "Área",
  fechaIngreso: "Fecha de ingreso", email: "Correo", telefono: "Teléfono", rfc: "RFC",
  curp: "CURP", nss: "NSS", domicilio: "Domicilio", sueldoSemanal: "Sueldo semanal",
};

export default function ImportarPersonalExcel({ token }: { token: string }) {
  return <ImportarPersonalExcelSesion key={token} token={token} />;
}

function ImportarPersonalExcelSesion({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<Record<number, string[]>>({});
  const [saving, setSaving] = useState(false);
  const ocupado = useRef(false);

  const onFile = async (file: File | null) => {
    if (!file || !token || ocupado.current) return;
    ocupado.current = true;
    setLoading(true);
    setError(null);
    setPreview(null);
    setSelected({});
    try {
      const out = await previewImportPersonal(token, file) as Preview;
      setPreview(out);
      const init: Record<number, string[]> = {};
      for (const row of out.seActualiza) {
        init[row.userId] = row.cambios.filter((c) => !["sueldoSemanal", "puesto"].includes(c.campo)).map((c) => c.campo);
      }
      setSelected(init);
    } catch (e) {
      setError(formatApiError(e, "No se pudo leer el Excel."));
    } finally {
      ocupado.current = false;
      setLoading(false);
    }
  };

  const confirmar = async () => {
    if (!preview || !token || ocupado.current || !Object.values(selected).some((lista) => lista.length)) return;
    ocupado.current = true;
    setSaving(true);
    setError(null);
    try {
      const actualizar = preview.seActualiza
        .filter((r) => (selected[r.userId] ?? []).length)
        .map((r) => {
          const campos = selected[r.userId] ?? [];
          const patch: Record<string, unknown> = { userId: r.userId, campos };
          for (const c of r.cambios) {
            if (!campos.includes(c.campo)) continue;
            if (c.campo === "domicilio") patch.domicilio = c.excel;
            else if (c.campo === "fechaIngreso") patch.fechaIngreso = c.excel;
            else if (c.campo === "employeeNumber") patch.employeeNumber = c.excel;
            else patch[c.campo] = c.excel;
          }
          return patch;
        });
      await confirmarImportPersonal(token, {
        actualizar,
        marcarAlta: preview.noEstaEnPlataforma.map((x) => ({
          fila: x.fila,
          nombre: x.nombre,
          correo: x.correo,
          idNex: x.idNex,
        })),
      });
      toast.success("Cambios aplicados. Las altas y bajas siguen los flujos existentes.");
      setOpen(false);
      setPreview(null);
    } catch (e) {
      setError(formatApiError(e, "No se pudieron aplicar los cambios."));
    } finally {
      ocupado.current = false;
      setSaving(false);
    }
  };

  return (
    <>
      <Button variant="secondary" disabled={!token} onClick={() => { setError(null); setPreview(null); setSelected({}); setOpen(true); }}>Importar Excel de personal</Button>
      {!token && <InlineAlert variant="info" dense message="Inicia sesión para importar personal." />}
      <Modal open={open} onClose={() => !ocupado.current && setOpen(false)} title="Importar Base_Personal" size="lg">
        <p style={{ marginTop: 0, color: "var(--text-secondary)", fontSize: 14 }}>
          Sube el Excel de Tere (hoja Base_Personal). Verás una vista previa; nada se escribe hasta que confirmes.
        </p>
        <input
          type="file"
          aria-label="Excel de personal"
          accept=".xlsx,.xls"
          disabled={loading || saving}
          onChange={(e) => { void onFile(e.target.files?.[0] ?? null); e.target.value = ""; }}
        />
        {loading && <InlineAlert variant="info" dense message="Leyendo el Excel…" style={{ marginTop: 12 }} />}
        {error && <InlineAlert variant="danger" dense message={error} style={{ marginTop: 12 }} />}
        {!loading && !preview && !error && (
          <InlineAlert variant="info" dense message="Elige un archivo .xlsx para ver la vista previa." style={{ marginTop: 12 }} />
        )}
        {preview && (
          <div style={{ marginTop: 16, display: "grid", gap: 16 }}>
            <InlineAlert variant="info" dense message={preview.nota || `Filas leídas: ${preview.totalFilas}`} />

            <section>
              <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>Se actualiza ({preview.seActualiza.length})</h3>
              {!preview.seActualiza.length && <p style={{ color: "var(--text-tertiary)", fontSize: 13 }}>Sin diferencias.</p>}
              {preview.seActualiza.map((row) => (
                <div key={row.userId} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, marginBottom: 8 }}>
                  <strong>{row.nombre}</strong> <span style={{ color: "var(--text-tertiary)" }}>{row.employeeNumber}</span>
                  <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13 }}>
                    {row.cambios.map((c) => (
                      <li key={c.campo}>
                        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <input
                            type="checkbox"
                            disabled={saving || ["sueldoSemanal", "puesto"].includes(c.campo)}
                            checked={(selected[row.userId] ?? []).includes(c.campo)}
                            onChange={(e) => {
                              setSelected((prev) => {
                                const cur = new Set(prev[row.userId] ?? []);
                                if (e.target.checked) cur.add(c.campo);
                                else cur.delete(c.campo);
                                return { ...prev, [row.userId]: [...cur] };
                              });
                            }}
                          />
                          <span>
                            {campos[c.campo] ?? c.campo}: «{c.actual ?? "—"}» → «{c.excel ?? "—"}»
                            {["sueldoSemanal", "puesto"].includes(c.campo) ? " (solicita el cambio desde el expediente; requiere aprobación de dirección)" : ""}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>

            <section>
              <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>No está en la plataforma ({preview.noEstaEnPlataforma.length})</h3>
              {!preview.noEstaEnPlataforma.length && <p style={{ color: "var(--text-tertiary)", fontSize: 13 }}>Nadie nuevo.</p>}
              {preview.noEstaEnPlataforma.map((x) => (
                <div key={x.fila} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, marginBottom: 6 }}>
                  <span>{x.nombre || "Sin nombre"} · {x.idNex || "sin NEX"} · {x.correo || "sin correo"}</span>
                  <Link href="/erp/hr" style={{ color: "var(--primary)" }}>Dar de alta →</Link>
                </div>
              ))}
            </section>

            <section>
              <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>Baja en Excel, activo aquí ({preview.bajaEnExcelActivoEnPlataforma.length})</h3>
              {!preview.bajaEnExcelActivoEnPlataforma.length && <p style={{ color: "var(--text-tertiary)", fontSize: 13 }}>Nadie en este caso.</p>}
              {preview.bajaEnExcelActivoEnPlataforma.map((x) => (
                <div key={x.userId} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, marginBottom: 6 }}>
                  <span>{x.nombre} · {x.employeeNumber}</span>
                  <Link href={`/erp/hr/${x.userId}`} style={{ color: "var(--primary)" }}>Solicitar baja →</Link>
                </div>
              ))}
            </section>

            {!Object.values(selected).some((lista) => lista.length) && <InlineAlert variant="info" dense message="No hay cambios elegidos para aplicar. Las altas y bajas se solicitan por separado." />}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button variant="ghost" disabled={saving} onClick={() => setOpen(false)}>Cancelar</Button>
              <Button variant="primary" disabled={saving || !Object.values(selected).some((lista) => lista.length)} onClick={() => void confirmar()}>
                {saving ? "Aplicando…" : "Confirmar cambios elegidos"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
