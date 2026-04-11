"use client";
import { buildApiUrl } from "@/lib/api-base";
import React, { useEffect, useState } from 'react';
import { RoleGuard } from '../../../../components/RoleGuard';
import { useUser } from '../../../../components/UserContext';
import { PERMISSIONS } from '@/lib/permissions';
import HelpTab from '@/components/HelpTab';

interface Payment {
  id: number;
  userId: number;
  user?: { nombre: string; email: string };
  concepto?: string;
  monto: number;
  fecha: string;
  tipo?: string;
  referencia?: string;
  notas?: string;
  createdAt: string;
}

export default function EmployeePaymentsPage() {
  const { user } = useUser();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [form, setForm] = useState({
    userId: '',
    periodFrom: '',
    periodTo: '',
    totalMinutes: '',
    amount: '',
    note: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState('');
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  useEffect(() => {
    if (!file) {
      setFilePreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(file);
    setFilePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const isPreviewableFile = (candidate: File) => {
    return candidate.type === 'application/pdf' || candidate.type.startsWith('image/');
  };

  const assignFile = (candidate: File | null) => {
    if (!candidate) {
      setFile(null);
      return;
    }
    if (!isPreviewableFile(candidate)) {
      alert('Solo se permiten archivos PDF o imagen.');
      return;
    }
    setFile(candidate);
  };

  const loadPayments = async () => {
    if (!user?.token) {
      setPayments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let url = 'employee-payments';
      const params = new URLSearchParams();
      if (filterFrom) params.append('from', filterFrom);
      if (filterTo) params.append('to', filterTo);
      const qs = params.toString();
      if (qs) url += `?${qs}`;
      const response = await fetch(buildApiUrl(url), {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (!response.ok) {
        setPayments([]);
        return;
      }
      const data = await response.json();
      setPayments(Array.isArray(data) ? data : data?.data || []);
    } catch (error) {
      console.error('Error loading payments:', error);
      setPayments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
  }, [user?.token, filterFrom, filterTo]);

  const totalMonto = payments.reduce((acc, p) => acc + (p.monto || 0), 0);

  const submitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.token) return;

    const userId = Number(form.userId || user?.id || 0);
    const amount = Number(form.amount || 0);
    if (!userId || !form.periodFrom || !form.periodTo || amount <= 0) {
      alert('Completa empleado, periodo y monto valido.');
      return;
    }

    setSaving(true);
    try {
      const body = new FormData();
      body.append('userId', String(userId));
      body.append('periodFrom', form.periodFrom);
      body.append('periodTo', form.periodTo);
      body.append('amount', String(amount));
      if (form.totalMinutes) body.append('totalMinutes', String(Number(form.totalMinutes)));
      if (form.note) body.append('note', form.note);
      if (file) body.append('files', file);

      const res = await fetch(buildApiUrl('employee-payments'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.token}` },
        body,
      });

      if (!res.ok) {
        const msg = await res.text().catch(() => 'Error al crear pago.');
        throw new Error(msg || 'Error al crear pago.');
      }

      setForm({ userId: '', periodFrom: '', periodTo: '', totalMinutes: '', amount: '', note: '' });
      setFile(null);
      await loadPayments();
    } catch (error: any) {
      alert(error?.message || 'No se pudo registrar el pago.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <RoleGuard anyPermissions={[PERMISSIONS.ACCOUNTING_VIEW, PERMISSIONS.ACCOUNTING_MANAGE, PERMISSIONS.CONSOLE_ADMIN]}>
      <div style={{ display: 'grid', gap: 24 }}>
        <HelpTab module="employee-payments" user={user} />

        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginBottom: 12, color: 'var(--primary)' }}>Registrar nomina / pago</h3>
          <form onSubmit={submitPayment} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, alignItems: 'start' }}>
            <input
              type="number"
              placeholder="ID empleado"
              value={form.userId}
              onChange={(e) => setForm((prev) => ({ ...prev, userId: e.target.value }))}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}
            />
            <input
              type="date"
              value={form.periodFrom}
              onChange={(e) => setForm((prev) => ({ ...prev, periodFrom: e.target.value }))}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}
            />
            <input
              type="date"
              value={form.periodTo}
              onChange={(e) => setForm((prev) => ({ ...prev, periodTo: e.target.value }))}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}
            />
            <input
              type="number"
              min={0}
              placeholder="Minutos totales"
              value={form.totalMinutes}
              onChange={(e) => setForm((prev) => ({ ...prev, totalMinutes: e.target.value }))}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}
            />
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder="Monto"
              value={form.amount}
              onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}
            />
            <input
              type="text"
              placeholder="Nota / referencia"
              value={form.note}
              onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)' }}
            />
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingFile(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDraggingFile(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingFile(false);
                assignFile(e.dataTransfer.files?.[0] || null);
              }}
              style={{
                gridColumn: '1 / -1',
                padding: '10px 12px',
                borderRadius: 8,
                border: `2px dashed ${isDraggingFile ? 'var(--primary)' : 'var(--border)'}`,
                background: isDraggingFile ? 'color-mix(in srgb, var(--primary) 8%, transparent)' : 'var(--card-bg)',
                display: 'grid',
                gap: 8,
                alignContent: 'start',
              }}
            >
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Arrastra y suelta tu comprobante (PDF o imagen)
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <label
                  htmlFor="employee-payment-file-input"
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: '#fff',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                  }}
                >
                  Seleccionar archivo
                </label>
                <input
                  id="employee-payment-file-input"
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(e) => assignFile(e.target.files?.[0] || null)}
                  style={{ display: 'none' }}
                />
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                  {file ? file.name : 'Ningun archivo seleccionado'}
                </span>
              </div>
              {file && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'transparent',
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                  >
                    Quitar
                  </button>
                  {filePreviewUrl && (
                    <a
                      href={filePreviewUrl}
                      download={file.name}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 6,
                        border: '1px solid var(--border)',
                        textDecoration: 'none',
                        color: 'var(--text-primary)',
                        fontSize: 12,
                      }}
                    >
                      Descargar
                    </a>
                  )}
                </div>
              )}
            </div>
            <button
              type="submit"
              disabled={saving}
              style={{
                gridColumn: '1 / -1',
                justifySelf: 'start',
                padding: '8px 14px',
                borderRadius: 8,
                background: 'var(--primary)',
                color: '#fff',
                border: 'none',
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Guardando...' : 'Registrar pago'}
            </button>
          </form>

          {file && filePreviewUrl && (
            <div className="card" style={{ marginTop: 12, padding: 12 }}>
              <h4 style={{ margin: '0 0 10px', color: 'var(--primary)' }}>Vista previa del comprobante</h4>
              {file.type === 'application/pdf' ? (
                <iframe
                  title="Vista previa PDF"
                  src={filePreviewUrl}
                  style={{ width: '100%', height: 420, border: '1px solid var(--border)', borderRadius: 8 }}
                />
              ) : file.type.startsWith('image/') ? (
                <img
                  src={filePreviewUrl}
                  alt="Vista previa comprobante"
                  style={{ maxWidth: '100%', maxHeight: 420, borderRadius: 8, border: '1px solid var(--border)' }}
                />
              ) : (
                <p style={{ color: 'var(--text-secondary)' }}>El archivo no es previsualizable.</p>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--primary)' }}>{payments.length}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Pagos registrados</div>
          </div>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--success, #22c55e)' }}>
              ${totalMonto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Total pagado</div>
          </div>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--warning, #f59e0b)' }}>
              {payments.length > 0
                ? `$${(totalMonto / payments.length).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
                : '$0.00'}
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Promedio por pago</div>
          </div>
        </div>

        <div className="card" style={{ padding: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ fontSize: 13 }}>Desde:</label>
          <input
            type="date"
            value={filterFrom}
            onChange={e => setFilterFrom(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }}
          />
          <label style={{ fontSize: 13 }}>Hasta:</label>
          <input
            type="date"
            value={filterTo}
            onChange={e => setFilterTo(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }}
          />
          <button
            onClick={loadPayments}
            style={{
              padding: '6px 16px',
              borderRadius: 6,
              background: 'var(--primary)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Filtrar
          </button>
        </div>

        <div className="card" style={{ padding: 16, overflowX: 'auto' }}>
          <h2 style={{ marginBottom: 12, color: 'var(--primary)' }}>Registro de Pagos a Empleados</h2>
          {loading ? (
            <p>Cargando pagos...</p>
          ) : payments.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No se encontraron pagos en el periodo seleccionado.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 6px' }}>ID</th>
                  <th style={{ padding: '8px 6px' }}>Empleado</th>
                  <th style={{ padding: '8px 6px' }}>Concepto</th>
                  <th style={{ padding: '8px 6px' }}>Monto</th>
                  <th style={{ padding: '8px 6px' }}>Tipo</th>
                  <th style={{ padding: '8px 6px' }}>Fecha</th>
                  <th style={{ padding: '8px 6px' }}>Referencia</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 6px' }}>{p.id}</td>
                    <td style={{ padding: '8px 6px' }}>{p.user?.nombre || `User #${p.userId}`}</td>
                    <td style={{ padding: '8px 6px' }}>{p.concepto || '—'}</td>
                    <td style={{ padding: '8px 6px', fontWeight: 600 }}>
                      ${(p.monto || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '8px 6px' }}>{p.tipo || '—'}</td>
                    <td style={{ padding: '8px 6px' }}>
                      {p.fecha ? new Date(p.fecha).toLocaleDateString('es-MX') : '—'}
                    </td>
                    <td style={{ padding: '8px 6px' }}>{p.referencia || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </RoleGuard>
  );
}
