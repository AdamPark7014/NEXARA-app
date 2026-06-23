'use client';

/**
 * NEXARA · Core · Bandeja unificada de Aprobaciones
 * ---------------------------------------------------
 * Inbox v2 que agrupa todo lo que un aprobador puede resolver:
 *   - Viáticos
 *   - Evidencias de actividades
 *   - Cotizaciones
 *   - Compras (POs)
 *
 * El backend (apps/api/src/common/rbac/approval-policy.ts) define las cadenas
 * de aprobación por dominio; este componente sólo consume `/approvals/inbox`
 * y deriva las pestañas por tipo + contador.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@/components/UserContext';

type ApprovalKind = 'viaticos' | 'evidencias' | 'cotizaciones' | 'compras';

type InboxItem = {
  id: string;
  kind: ApprovalKind;
  title: string;
  amount?: number;
  currency?: string;
  requester: string;
  createdAt: string;
  href: string;
  status: 'pending' | 'in_review';
};

const KIND_LABEL: Record<ApprovalKind, string> = {
  viaticos: 'Viáticos',
  evidencias: 'Evidencias',
  cotizaciones: 'Cotizaciones',
  compras: 'Compras',
};

const TABS: { key: 'todas' | ApprovalKind; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'viaticos', label: 'Viáticos' },
  { key: 'evidencias', label: 'Evidencias' },
  { key: 'cotizaciones', label: 'Cotizaciones' },
  { key: 'compras', label: 'Compras' },
];

export default function AprobacionesInboxPage() {
  const { user, isContextReady } = useUser();
  const [active, setActive] = useState<(typeof TABS)[number]['key']>('todas');
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isContextReady || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/approvals/inbox', {
          credentials: 'include',
          headers: { 'cache-control': 'no-store' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as InboxItem[];
        if (!cancelled) setItems(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar la bandeja');
          setItems([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isContextReady, user]);

  const counts = useMemo(() => {
    const base: Record<ApprovalKind, number> = {
      viaticos: 0, evidencias: 0, cotizaciones: 0, compras: 0,
    };
    (items ?? []).forEach((it) => { base[it.kind] += 1; });
    return base;
  }, [items]);

  const filtered = useMemo(() => {
    if (!items) return [];
    return active === 'todas' ? items : items.filter((it) => it.kind === active);
  }, [items, active]);

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Mis aprobaciones</h1>
        <p style={{ color: '#64748b', margin: '4px 0 0' }}>
          Bandeja unificada — todos los pendientes que requieren tu firma o visto bueno.
        </p>
      </header>

      <nav role="tablist" style={{
        display: 'flex', gap: 4, borderBottom: '1px solid #e5e7eb', marginBottom: 20,
      }}>
        {TABS.map((t) => {
          const isActive = active === t.key;
          const count = t.key === 'todas' ? (items?.length ?? 0) : counts[t.key];
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActive(t.key)}
              style={{
                padding: '10px 16px', fontSize: 14, background: 'transparent', border: 'none',
                fontWeight: isActive ? 600 : 500, cursor: 'pointer',
                color: isActive ? '#0f172a' : '#64748b',
                borderBottom: isActive ? '2px solid #2563eb' : '2px solid transparent',
                display: 'inline-flex', alignItems: 'center', gap: 8,
              }}
            >
              {t.label}
              <span style={{
                background: isActive ? '#2563eb' : '#e2e8f0',
                color: isActive ? '#fff' : '#475569',
                borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 600,
              }}>{count}</span>
            </button>
          );
        })}
      </nav>

      {error && (
        <div style={{
          background: '#fef2f2', color: '#991b1b', padding: 12, borderRadius: 8, marginBottom: 16,
        }}>{error}</div>
      )}

      {items === null && (
        <div style={{ color: '#64748b', padding: 32, textAlign: 'center' }}>Cargando…</div>
      )}

      {items !== null && filtered.length === 0 && (
        <div style={{
          padding: 48, textAlign: 'center', color: '#94a3b8', border: '1px dashed #cbd5e1', borderRadius: 12,
        }}>
          Sin pendientes en esta categoría.
        </div>
      )}

      {filtered.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          {filtered.map((it) => (
            <li key={`${it.kind}-${it.id}`} style={{
              background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16,
              display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: 16, alignItems: 'center',
            }}>
              <span style={{
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
                color: '#2563eb', background: '#dbeafe', padding: '4px 10px', borderRadius: 999,
                textAlign: 'center',
              }}>{KIND_LABEL[it.kind]}</span>
              <div>
                <div style={{ fontWeight: 600, color: '#0f172a' }}>{it.title}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  Solicitado por {it.requester} · {new Date(it.createdAt).toLocaleString('es-MX')}
                  {it.amount !== undefined && (
                    <> · <strong>{it.currency ?? 'MXN'} {it.amount.toLocaleString('es-MX')}</strong></>
                  )}
                </div>
              </div>
              <Link href={it.href} style={{
                fontSize: 13, color: '#fff', background: '#2563eb', padding: '8px 16px',
                borderRadius: 8, textDecoration: 'none', fontWeight: 600,
              }}>Revisar →</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
