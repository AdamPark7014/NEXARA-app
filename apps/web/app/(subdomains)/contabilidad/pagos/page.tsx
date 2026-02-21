"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useUser } from "@/components/UserContext";
import styles from "./page.module.css";

interface PaymentUser {
  id: number;
  nombre: string;
  email: string;
  department?: { nombre: string } | null;
}

interface PaymentRecord {
  id: number;
  userId: number;
  periodFrom: string;
  periodTo: string;
  totalMinutes: number;
  amount: string;
  note?: string | null;
  evidenceUrls: string[];
  createdAt: string;
  user: PaymentUser;
  createdBy?: { nombre: string } | null;
}

interface AttendanceRangeUser {
  userId: number;
  userName: string;
  email: string;
  department?: string | null;
}

export default function ContabilidadPagos() {
  const { user } = useUser();
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rangeFrom, setRangeFrom] = useState<string>(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return start.toISOString().slice(0, 10);
  });
  const [rangeTo, setRangeTo] = useState<string>(() => {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return end.toISOString().slice(0, 10);
  });
  const [employees, setEmployees] = useState<AttendanceRangeUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<number | "">("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api").replace(/[\/.]+$/, "");
  const buildApiUrl = (path: string) => `${API_URL}/${path.replace(/^\/+/, "")}`;
  const assetBaseUrl = API_URL.replace(/\/+api\/?$/, "");

  const fetchPayments = async () => {
    if (!user?.token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from: rangeFrom, to: rangeTo });
      const res = await fetch(buildApiUrl(`employee-payments?${params.toString()}`), {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (!res.ok) throw new Error("No se pudo cargar pagos");
      const data = await res.json();
      setPayments(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar pagos");
      setPayments([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployees = async () => {
    if (!user?.token) return;
    try {
      const params = new URLSearchParams({ from: rangeFrom, to: rangeTo });
      const res = await fetch(buildApiUrl(`attendance/hierarchy/range?${params.toString()}`), {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setEmployees(Array.isArray(data?.users) ? data.users : []);
    } catch {
      setEmployees([]);
    }
  };

  useEffect(() => {
    fetchPayments();
    fetchEmployees();
  }, [user?.token, rangeFrom, rangeTo]);

  const totalPaid = useMemo(() => {
    return payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  }, [payments]);

  const uniqueEmployees = useMemo(() => {
    return new Set(payments.map((payment) => payment.userId)).size;
  }, [payments]);

  const formatMoney = (value: number) =>
    value.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60).toString().padStart(2, "0");
    const mins = Math.floor(minutes % 60).toString().padStart(2, "0");
    return `${hours}:${mins}`;
  };

  const handleFileSelect = (selected?: File[] | null) => {
    if (!selected || selected.length === 0) return;
    setFiles((prev) => [...prev, ...selected]);
  };

  const submitPayment = async () => {
    if (!user?.token) return;
    if (!selectedUser || !amount) {
      setError("Selecciona un empleado y define el monto.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("userId", String(selectedUser));
      formData.append("periodFrom", rangeFrom);
      formData.append("periodTo", rangeTo);
      formData.append("amount", amount);
      if (note) formData.append("note", note);
      files.forEach((file) => formData.append("files", file));

      const res = await fetch(buildApiUrl("employee-payments"), {
        method: "POST",
        headers: { Authorization: `Bearer ${user.token}` },
        body: formData,
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || "Error al registrar pago");
      }
      setAmount("");
      setNote("");
      setFiles([]);
      await fetchPayments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrar pago");
    } finally {
      setSaving(false);
    }
  };

  const renderEvidence = (url: string) => {
    const absoluteUrl = url.startsWith("http") ? url : `${assetBaseUrl}${url}`;
    if (url.toLowerCase().endsWith(".pdf")) {
      return (
        <div className={styles.evidenceItem}>
          <object data={absoluteUrl} type="application/pdf" width="96" height="110">
            <a href={absoluteUrl} target="_blank" rel="noreferrer">PDF</a>
          </object>
        </div>
      );
    }
    return (
      <div className={styles.evidenceItem}>
        <img src={absoluteUrl} alt="Evidencia" />
      </div>
    );
  };

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Contabilidad</p>
          <h1 className={styles.title}>Pagos al personal</h1>
          <p className={styles.subtitle}>
            Controla periodos, evidencia de pago y concentrado mensual por empleado.
          </p>
        </div>
        <div className={styles.rangeControls}>
          <label>
            Desde
            <input type="date" className="input" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} />
          </label>
          <label>
            Hasta
            <input type="date" className="input" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} />
          </label>
          <button className="button-secondary" onClick={fetchPayments}>
            Actualizar
          </button>
        </div>
      </header>

      <div className={styles.metrics}>
        <div className={styles.metricCard}>
          <span>Pagos registrados</span>
          <strong>{payments.length}</strong>
        </div>
        <div className={styles.metricCard}>
          <span>Total pagado</span>
          <strong>{formatMoney(totalPaid)}</strong>
        </div>
        <div className={styles.metricCard}>
          <span>Empleados con pago</span>
          <strong>{uniqueEmployees}</strong>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.grid}>
        <section className={styles.formCard}>
          <h2>Registrar pago</h2>
          <div className={styles.formGrid}>
            <label>
              Empleado
              <select
                className="input"
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">Selecciona empleado</option>
                {employees.map((emp) => (
                  <option key={emp.userId} value={emp.userId}>
                    {emp.userName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Monto
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label className={styles.fullRow}>
              Notas
              <input
                className="input"
                placeholder="Concepto del pago"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
          </div>

          <div
            className={styles.dropzone}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              handleFileSelect(Array.from(event.dataTransfer.files || []));
            }}
          >
            <input
              id="payment-files"
              type="file"
              multiple
              accept="image/*,.pdf"
              onChange={(e) => handleFileSelect(Array.from(e.target.files || []))}
              style={{ display: "none" }}
            />
            <p>Arrastra evidencia (imagen o PDF) o</p>
            <label htmlFor="payment-files" className="button-secondary">
              Seleccionar archivos
            </label>
            <span>
              {files.length > 0 ? `${files.length} archivo(s) listos` : "Ningun archivo seleccionado"}
            </span>
          </div>

          {files.length > 0 && (
            <div className={styles.fileList}>
              {files.map((file) => (
                <div key={file.name}>{file.name}</div>
              ))}
            </div>
          )}

          <button className="button-primary" onClick={submitPayment} disabled={saving}>
            {saving ? "Registrando..." : "Registrar pago"}
          </button>
        </section>

        <section className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <h2>Historial de pagos</h2>
            {loading && <span>Cargando...</span>}
          </div>
          <div className={styles.tableWrap}>
            <table className="table">
              <thead>
                <tr>
                  <th>Empleado</th>
                  <th>Periodo</th>
                  <th>Horas</th>
                  <th>Monto</th>
                  <th>Evidencia</th>
                  <th>Registrado por</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      <strong>{payment.user?.nombre}</strong>
                      <div className={styles.metaText}>{payment.user?.email}</div>
                    </td>
                    <td>
                      <div>{payment.periodFrom?.slice(0, 10)} - {payment.periodTo?.slice(0, 10)}</div>
                      <div className={styles.metaText}>{payment.note || "Sin notas"}</div>
                    </td>
                    <td>{formatTime(payment.totalMinutes || 0)}</td>
                    <td className={styles.amount}>{formatMoney(Number(payment.amount || 0))}</td>
                    <td>
                      <div className={styles.evidenceGrid}>
                        {payment.evidenceUrls?.length
                          ? payment.evidenceUrls.map((url) => (
                              <React.Fragment key={url}>{renderEvidence(url)}</React.Fragment>
                            ))
                          : "-"}
                      </div>
                    </td>
                    <td>
                      <div>{payment.createdBy?.nombre || "-"}</div>
                      <div className={styles.metaText}>{payment.createdAt?.slice(0, 10)}</div>
                    </td>
                  </tr>
                ))}
                {!loading && payments.length === 0 && (
                  <tr>
                    <td colSpan={6} className={styles.emptyState}>
                      No hay pagos en este rango.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </section>
  );
}
