'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import RestartAltOutlinedIcon from '@mui/icons-material/RestartAltOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import { TabBar, type TabItem } from '@/components/rbac/TabBar';
import Button from '@/components/ui/Button';
import ConfirmDialog, { type ConfirmState } from '@/components/ui/ConfirmDialog';
import { Tag } from '@/components/ui/DataTable';
import { useUser } from '@/components/UserContext';
import { DetailLoading } from '@/components/detail/DetailFrame';
import {
  deactivateOperationalProject,
  deleteOperationalProject,
  formatOperationalProjectStatus,
  getOperationalProject,
  isInactiveOperationalProject,
  reactivateOperationalProject,
  type OperationalProject,
} from '@/lib/ops-operational-api';
import { getClientPermissions, NO_CLIENT_PERMISSIONS, type ClientPermissions } from '@/lib/sales-api';

type Ctx = {
  id: number;
  project: OperationalProject | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  /** Misma regla que clientes: solo Christian desactiva, reactiva o elimina (y pone o quita «Inactivo»). */
  permisos: ClientPermissions;
};

const OpsProjectDetailContext = createContext<Ctx | null>(null);

export function useOpsProjectDetail() {
  const ctx = useContext(OpsProjectDetailContext);
  if (!ctx) throw new Error('useOpsProjectDetail debe usarse dentro de OpsProjectDetailShell');
  return ctx;
}

export default function OpsProjectDetailShell({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const numericId = Number(id);
  const router = useRouter();
  const { user } = useUser();
  const token = user?.token ?? '';
  const [project, setProject] = useState<OperationalProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permisos, setPermisos] = useState<ClientPermissions>(NO_CLIENT_PERMISSIONS);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let vivo = true;
    getClientPermissions(token)
      .then((p) => vivo && setPermisos(p))
      .catch(() => vivo && setPermisos(NO_CLIENT_PERMISSIONS));
    return () => {
      vivo = false;
    };
  }, [token]);

  const load = useCallback(async () => {
    if (!token || !numericId) return;
    setLoading(true);
    setError(null);
    try {
      setProject(await getOperationalProject(token, numericId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el proyecto');
      setProject(null);
    } finally {
      setLoading(false);
    }
  }, [token, numericId]);

  useEffect(() => {
    void load();
  }, [load]);

  const base = `/ops/projects/${id}`;
  const tabs: TabItem[] = useMemo(
    () => [
      { id: 'resumen', label: 'Resumen', href: base },
      { id: 'actividades', label: 'Actividades', href: `${base}/actividades` },
      { id: 'ingenieros', label: 'Ingenieros', href: `${base}/ingenieros` },
    ],
    [base],
  );

  const ctx = useMemo(
    () => ({ id: numericId, project, loading, error, reload: load, permisos }),
    [numericId, project, loading, error, load, permisos],
  );

  const inactivo = isInactiveOperationalProject(project?.status);

  const pedirCambioEstatus = (activar: boolean) => {
    if (!project) return;
    setConfirm({
      title: activar ? 'Reactivar proyecto' : 'Desactivar proyecto',
      message: activar
        ? `«${project.title}» volverá a estar activo.`
        : `«${project.title}» quedará inactivo. Sus actividades y su historial se conservan y podrás reactivarlo después.`,
      confirmLabel: activar ? 'Reactivar' : 'Desactivar',
      danger: !activar,
      fn: async () => {
        if (!token) return;
        setActionError(null);
        try {
          await (activar
            ? reactivateOperationalProject(token, numericId)
            : deactivateOperationalProject(token, numericId));
          await load();
        } catch (e) {
          setActionError(e instanceof Error ? e.message : 'No se pudo cambiar el estatus del proyecto');
        }
      },
    });
  };

  const pedirEliminar = () => {
    if (!project) return;
    setConfirm({
      title: 'Eliminar proyecto',
      message: `¿Eliminar el proyecto «${project.title}»? Esta acción no se puede deshacer. Sus actividades conservan su historial. Si solo está detenido, mejor desactívalo.`,
      confirmLabel: 'Eliminar',
      danger: true,
      fn: async () => {
        if (!token) return;
        setActionError(null);
        try {
          await deleteOperationalProject(token, numericId);
          router.push('/ops/projects');
        } catch (e) {
          setActionError(e instanceof Error ? e.message : 'No se pudo eliminar el proyecto');
        }
      },
    });
  };

  return (
    <OpsProjectDetailContext.Provider value={ctx}>
      <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
        <header style={{ marginBottom: 16 }}>
          <Link
            href="/ops/projects"
            style={{ fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none' }}
          >
            ← Proyectos operativos
          </Link>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 12,
              marginTop: 6,
            }}
          >
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
                {loading && !project ? `Proyecto #${id}` : (project?.title ?? `Proyecto #${id}`)}
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                {project?.client?.name ?? 'Detalle de ejecución en campo'}
              </p>
              {project && (
                <div style={{ marginTop: 8 }}>
                  <Tag
                    variant={
                      project.status === 'ACTIVE'
                        ? 'accent'
                        : project.status === 'COMPLETED'
                          ? 'neutral'
                          : 'warning'
                    }
                  >
                    {formatOperationalProjectStatus(project.status)}
                  </Tag>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {project && permisos.puedeDesactivar ? (
                <Button
                  variant="ghost"
                  iconLeft={
                    inactivo ? (
                      <RestartAltOutlinedIcon aria-hidden="true" sx={{ fontSize: 16 }} />
                    ) : (
                      <BlockOutlinedIcon aria-hidden="true" sx={{ fontSize: 16 }} />
                    )
                  }
                  onClick={() => pedirCambioEstatus(inactivo)}
                >
                  {inactivo ? 'Reactivar' : 'Desactivar'}
                </Button>
              ) : null}
              {project && permisos.puedeEliminar ? (
                <Button
                  variant="ghost"
                  iconLeft={<DeleteOutlineOutlinedIcon aria-hidden="true" sx={{ fontSize: 16 }} />}
                  onClick={pedirEliminar}
                  style={{ color: 'var(--danger)' }}
                >
                  Eliminar
                </Button>
              ) : null}
              <Button variant="ghost" onClick={() => void load()}>
                Actualizar
              </Button>
            </div>
          </div>
          {actionError ? (
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--danger)' }}>{actionError}</p>
          ) : null}
        </header>
        <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
        <TabBar tabs={tabs} />
        <section style={{ marginTop: 8 }}>
          {loading && !project ? <DetailLoading /> : children}
        </section>
      </div>
    </OpsProjectDetailContext.Provider>
  );
}
