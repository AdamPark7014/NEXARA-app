"use client";
import React, { useEffect, useRef, useState } from 'react';
import ClientLocationPicker, { ClientLocationValue } from './ClientLocationPicker';
import styles from './BranchesForm.module.css';
import { io, Socket } from 'socket.io-client';

export type Branch = {
  id: number;
  name: string;
  branchNumber?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  placeId?: string | null;
  latitud?: number | null;
  longitud?: number | null;
  portalEmail?: string | null;
  logoUrl?: string | null;
  isActive?: boolean;
};

type BranchDraftType = {
  name: string;
  branchNumber: string;
  address: string;
  city: string;
  state: string;
  country: string;
  placeId: string;
  latitud: number | null;
  longitud: number | null;
  portalEmail: string;
  portalPassword: string;
  logoUrl: string;
  isActive: boolean;
};

type SortField = 'name' | 'branchNumber' | 'city' | 'portalEmail' | 'isActive';
type SortDirection = 'asc' | 'desc';

interface BranchesFormProps {
  token: string;
  branches: Branch[];
  onBranchSaved: () => void;
  clientLogoUrl?: string | null;
  companyLogoUrl?: string | null;
  apiUrl: string;
}

const BranchesForm: React.FC<BranchesFormProps> = ({
  token,
  branches,
  onBranchSaved,
  clientLogoUrl,
  companyLogoUrl,
  apiUrl,
}) => {
  const [editingBranchId, setEditingBranchId] = useState<number | null>(null);
  const [branchDraft, setBranchDraft] = useState<BranchDraftType>({
    name: '',
    branchNumber: '',
    address: '',
    city: '',
    state: '',
    country: '',
    placeId: '',
    latitud: null,
    longitud: null,
    portalEmail: '',
    portalPassword: '',
    logoUrl: '',
    isActive: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoDragging, setLogoDragging] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Nuevas variables para filtrado, orden y exportación
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  useEffect(() => {
    if (!logoFile) {
      setLogoPreview(null);
      return;
    }
    const url = URL.createObjectURL(logoFile);
    setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  useEffect(() => {
    if (!token) return;

    const socketUrl = apiUrl.replace(/[\/.]+$/, '').replace(/\/+api\/?$/, '');
    const socket: Socket = io(socketUrl, { transports: ['polling', 'websocket'] });
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        onBranchSaved();
      }, 300);
    };

    socket.on('entity:updated', (payload: { model?: string }) => {
      if (!payload?.model) return;
      if (['Branch', 'ClientBranch', 'ClientPortalBranch'].includes(payload.model)) {
        scheduleRefresh();
      }
    });

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      socket.disconnect();
    };
  }, [token, apiUrl, onBranchSaved]);

  const getAssetUrl = (url?: string | null) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    const base = apiUrl.replace(/\/+api\/?$/, '');
    return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  const getDefaultLogo = () => clientLogoUrl || companyLogoUrl || '';

  const handleLogoSelect = (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    setLogoFile(file);
  };

  const handleLogoDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setLogoDragging(false);
    const file = event.dataTransfer.files?.[0];
    handleLogoSelect(file);
  };

  const resetBranchDraft = () => {
    setBranchDraft({
      name: '',
      branchNumber: '',
      address: '',
      city: '',
      state: '',
      country: '',
      placeId: '',
      latitud: null,
      longitud: null,
      portalEmail: '',
      portalPassword: '',
      logoUrl: '',
      isActive: true,
    });
    setEditingBranchId(null);
    setLogoFile(null);
    setLogoPreview(null);
    setShowPassword(false);
  };

  const handleBranchEdit = (branch: Branch) => {
    setEditingBranchId(branch.id);
    setBranchDraft({
      name: branch.name || '',
      branchNumber: branch.branchNumber || '',
      address: branch.address || '',
      city: branch.city || '',
      state: branch.state || '',
      country: branch.country || '',
      placeId: branch.placeId || '',
      latitud: branch.latitud ?? null,
      longitud: branch.longitud ?? null,
      portalEmail: branch.portalEmail || '',
      portalPassword: '',
      logoUrl: branch.logoUrl || '',
      isActive: branch.isActive !== false,
    });
    if (branch.logoUrl) {
      setLogoPreview(getAssetUrl(branch.logoUrl));
    }
  };

  const handleBranchSave = async () => {
    if (!branchDraft.name.trim()) {
      setError('El nombre de la sucursal es obligatorio');
      return;
    }
    if (!branchDraft.branchNumber.trim()) {
      setError('El número de sucursal es obligatorio');
      return;
    }
    if (!branchDraft.portalEmail.trim()) {
      setError('El usuario de acceso es obligatorio');
      return;
    }
    if (!editingBranchId && !branchDraft.portalPassword.trim()) {
      setError('El password de acceso es obligatorio');
      return;
    }

    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(branchDraft.portalEmail)) {
      setError('El email de acceso no es válido. Ejemplo: usuario@empresa.com');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('name', branchDraft.name);
      formData.append('branchNumber', branchDraft.branchNumber);
      formData.append('address', branchDraft.address);
      formData.append('city', branchDraft.city);
      formData.append('state', branchDraft.state);
      formData.append('country', branchDraft.country);
      formData.append('placeId', branchDraft.placeId);
      formData.append('portalEmail', branchDraft.portalEmail);
      formData.append('isActive', String(branchDraft.isActive));

      if (branchDraft.latitud !== null) formData.append('latitud', String(branchDraft.latitud));
      if (branchDraft.longitud !== null) formData.append('longitud', String(branchDraft.longitud));
      if (branchDraft.portalPassword) formData.append('portalPassword', branchDraft.portalPassword);
      if (logoFile) formData.append('logo', logoFile);

      const endpoint = editingBranchId ? `client-portal/branches/${editingBranchId}` : 'client-portal/branches';
      const res = await fetch(apiUrl.replace(/[\/.]+$/, '') + '/' + endpoint.replace(/^\/+/, ''), {
        method: editingBranchId ? 'PUT' : 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'No se pudo guardar la sucursal');
      }

      resetBranchDraft();
      onBranchSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar la sucursal');
    } finally {
      setSaving(false);
    }
  };

  const handleBranchDelete = async (id: number) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta sucursal?')) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(apiUrl.replace(/[\/.]+$/, '') + '/client-portal/branches/' + id, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error('No se pudo eliminar la sucursal');
      }

      onBranchSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar la sucursal');
    } finally {
      setSaving(false);
    }
  };

  const handleLocationChange = (value: ClientLocationValue | null) => {
    if (value) {
      setBranchDraft((prev) => ({
        ...prev,
        address: value.address || '',
        placeId: value.placeId || '',
        latitud: value.latitud ?? null,
        longitud: value.longitud ?? null,
      }));
    }
  };

  // Función de búsqueda y filtrado
  const filteredBranches = branches.filter((branch) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      (branch.name?.toLowerCase().includes(searchLower)) ||
      (branch.branchNumber?.toLowerCase().includes(searchLower)) ||
      (branch.city?.toLowerCase().includes(searchLower)) ||
      (branch.portalEmail?.toLowerCase().includes(searchLower)) ||
      (branch.address?.toLowerCase().includes(searchLower))
    );
  });

  // Función de orden
  const sortedBranches = [...filteredBranches].sort((a, b) => {
    let aValue: any = '';
    let bValue: any = '';

    switch (sortField) {
      case 'name':
        aValue = a.name || '';
        bValue = b.name || '';
        break;
      case 'branchNumber':
        aValue = a.branchNumber || '';
        bValue = b.branchNumber || '';
        break;
      case 'city':
        aValue = a.city || '';
        bValue = b.city || '';
        break;
      case 'portalEmail':
        aValue = a.portalEmail || '';
        bValue = b.portalEmail || '';
        break;
      case 'isActive':
        aValue = a.isActive !== false ? 1 : 0;
        bValue = b.isActive !== false ? 1 : 0;
        break;
      default:
        return 0;
    }

    if (typeof aValue === 'string') {
      aValue = aValue.toLowerCase();
      bValue = (bValue as string).toLowerCase();
    }

    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // Función para exportar a CSV
  const handleExportCSV = () => {
    if (sortedBranches.length === 0) {
      setError('No hay sucursales para exportar');
      return;
    }

    const headers = ['Nombre', 'Número', 'Ciudad', 'Estado', 'País', 'Dirección', 'Usuario', 'Estado'];
    const rows = sortedBranches.map((branch) => [
      branch.name || '',
      branch.branchNumber || '',
      branch.city || '',
      branch.state || '',
      branch.country || '',
      branch.address || '',
      branch.portalEmail || '',
      branch.isActive !== false ? 'Activa' : 'Inactiva',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sucursales-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleSortChange = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIndicator = (field: SortField) => {
    if (sortField !== field) return ' ⬍';
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  };

  const sectionSurfaceStyle: React.CSSProperties = {
    display: 'grid',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    border: '1px solid color-mix(in srgb, var(--primary) 16%, transparent)',
    background: 'linear-gradient(155deg, color-mix(in srgb, var(--surface) 92%, transparent), color-mix(in srgb, var(--primary) 5%, transparent))',
  };

  const sectionHeaderStyle: React.CSSProperties = {
    display: 'grid',
    gap: 4,
  };

  const sectionTitleStyle: React.CSSProperties = {
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
    color: 'var(--text-primary)',
  };

  const sectionTextStyle: React.CSSProperties = {
    margin: 0,
    fontSize: 12,
    color: 'var(--text-secondary)',
  };

  const statusPanelStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
    padding: '16px 18px',
    borderRadius: 14,
    border: '1px solid rgba(31,107,186,0.18)',
    background: 'linear-gradient(135deg, rgba(31,107,186,0.08), rgba(18,133,98,0.08))',
  };

  const footerBarStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
    paddingTop: 4,
  };

  return (
    <div className={styles.root}>
      {/* Formulario de creación/edición */}
      <div className={styles.formCard}>
        <div style={sectionHeaderStyle}>
          <p style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '0.18rem', fontSize: 11, fontWeight: 700, color: 'var(--primary)' }}>
            Control de sucursales
          </p>
          <h3 className={styles.sectionTitle}>
            {editingBranchId ? 'Editar sucursal' : 'Crear nueva sucursal'}
          </h3>
          <p style={sectionTextStyle}>
            Configura identidad visual, ubicación y acceso operativo de cada sucursal desde una sola ficha administrativa.
          </p>
        </div>

        {error && (
          <div className={styles.errorBox}>
            {error}
          </div>
        )}

        {/* Logo section */}
        <div style={sectionSurfaceStyle}>
          <div style={sectionHeaderStyle}>
            <p style={sectionTitleStyle}>Identidad visual</p>
            <p style={sectionTextStyle}>Carga un logo propio para la sucursal o deja el logo corporativo como respaldo.</p>
          </div>
          <div className={styles.logoBox}>
            {/* Current/Default Logo */}
            <div className={styles.logoPreviewWrap}>
              {logoPreview ? (
                <img src={logoPreview} alt="Logo preview" className={styles.logoImg} />
              ) : getDefaultLogo() ? (
                <img src={getAssetUrl(getDefaultLogo())} alt="Default logo" className={styles.logoImg} />
              ) : (
                <span>Sin logo (usará el logo de la empresa)</span>
              )}
            </div>

            {/* Upload Area */}
            <div
              className={`${styles.uploadArea} ${logoDragging ? styles.uploadAreaDragging : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setLogoDragging(true);
              }}
              onDragLeave={() => setLogoDragging(false)}
              onDrop={handleLogoDrop}
              onClick={() => logoInputRef.current?.click()}
            >
              <span className={styles.uploadText}>
                Arrastra una imagen aquí o haz clic para seleccionar
              </span>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className={styles.hiddenInput}
                onChange={(e) => handleLogoSelect(e.target.files?.[0])}
              />
            </div>
          </div>
        </div>

        {/* Datos básicos */}
        <div style={sectionSurfaceStyle}>
          <div style={sectionHeaderStyle}>
            <p style={sectionTitleStyle}>Datos base</p>
            <p style={sectionTextStyle}>Define la sucursal como la reconocerán operaciones, reportes y portal de tickets.</p>
          </div>
          <div className={styles.formGrid}>
            <input
              className="input"
              placeholder="Nombre de la sucursal"
              value={branchDraft.name}
              onChange={(e) => setBranchDraft({ ...branchDraft, name: e.target.value })}
            />
            <input
              className="input"
              placeholder="Número de sucursal"
              value={branchDraft.branchNumber}
              onChange={(e) => setBranchDraft({ ...branchDraft, branchNumber: e.target.value })}
            />
          </div>
        </div>

        {/* Ubicación */}
        <div style={sectionSurfaceStyle}>
          <div style={sectionHeaderStyle}>
            <p style={sectionTitleStyle}>Ubicación</p>
            <p style={sectionTextStyle}>Guarda una referencia precisa para navegación, georreferencia y levantamiento de tickets.</p>
          </div>
          <ClientLocationPicker
            label="Busca la ubicación en Google Maps"
            value={{
              address: branchDraft.address,
              placeId: branchDraft.placeId,
              latitud: branchDraft.latitud,
              longitud: branchDraft.longitud,
            }}
            onChange={handleLocationChange}
          />
        </div>

        {/* Credenciales de acceso */}
        <div style={sectionSurfaceStyle}>
          <div style={sectionHeaderStyle}>
            <p style={sectionTitleStyle}>Acceso al portal</p>
            <p style={sectionTextStyle}>Estas credenciales se usarán para ingresar al portal de tickets y registrar solicitudes desde la sucursal.</p>
          </div>
          <div className={styles.formGrid}>
            <input
              className="input"
              placeholder="Usuario acceso sucursal (email)"
              value={branchDraft.portalEmail}
              onChange={(e) => setBranchDraft({ ...branchDraft, portalEmail: e.target.value })}
              type="email"
            />
            <div className={styles.passwordWrap}>
              <input
                className="input"
                type={showPassword ? 'text' : 'password'}
                placeholder={editingBranchId ? 'Nuevo password (opcional)' : 'Password sucursal'}
                value={branchDraft.portalPassword}
                onChange={(e) => setBranchDraft({ ...branchDraft, portalPassword: e.target.value })}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className={styles.passwordToggle}
                title={showPassword ? 'Ocultar' : 'Mostrar'}
              >
                {showPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
          </div>
        </div>

        {/* Estado activo */}
        <div style={statusPanelStyle}>
          <div style={sectionHeaderStyle}>
            <p style={sectionTitleStyle}>Estado operativo</p>
            <p style={sectionTextStyle}>{branchDraft.isActive ? 'La sucursal puede ingresar al portal y operar tickets.' : 'La sucursal queda registrada, pero sin acceso operativo activo.'}</p>
          </div>
          <div className={styles.activeRow}>
            <label className={styles.activeLabel}>
              <input
                type="checkbox"
                checked={branchDraft.isActive}
                onChange={(e) => setBranchDraft({ ...branchDraft, isActive: e.target.checked })}
                className={styles.checkbox}
              />
              <span className={styles.activeText}>Sucursal activa</span>
            </label>
          </div>
        </div>

        {/* Botones de acción */}
        <div style={footerBarStyle}>
          <p style={{ ...sectionTextStyle, maxWidth: 420 }}>
            Guarda la sucursal con identidad, ubicación y acceso correctamente definidos para mantener el portal de tickets ordenado.
          </p>
          <div className={styles.actions} style={{ marginTop: 0 }}>
          {editingBranchId && (
            <button
              className="button-secondary"
              onClick={resetBranchDraft}
              disabled={saving}
              type="button"
            >
              Cancelar
            </button>
          )}
          <button
            className="button-primary"
            onClick={handleBranchSave}
            disabled={saving}
            type="button"
          >
            {saving ? 'Guardando...' : editingBranchId ? 'Actualizar sucursal' : 'Guardar sucursal'}
          </button>
          </div>
        </div>
      </div>

      {/* Tabla de sucursales con búsqueda, orden y exportación */}
      {branches.length > 0 && (
        <div className={styles.tableSection}>
          <div className={styles.tableHeader}>
            <h3 className={styles.tableTitle}>Mis sucursales ({sortedBranches.length})</h3>
            <button
              className={`button-secondary ${styles.smallBtn}`}
              onClick={handleExportCSV}
              type="button"
            >
              📥 Exportar CSV
            </button>
          </div>

          {/* Búsqueda */}
          <div className={styles.searchBlock}>
            <input
              className={`input ${styles.fullWidth}`}
              placeholder="🔍 Buscar sucursal por nombre, número, ciudad, email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <div className={styles.searchResultHint}>
                Se encontraron {sortedBranches.length} resultado(s)
              </div>
            )}
          </div>

          {/* Tabla */}
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr className={styles.headerRow}>
                  <th className={styles.th}>Logo</th>
                  <th
                    className={`${styles.th} ${styles.sortable}`}
                    onClick={() => handleSortChange('name')}
                    title="Haz clic para ordenar"
                  >
                    Sucursal{getSortIndicator('name')}
                  </th>
                  <th
                    className={`${styles.th} ${styles.sortable}`}
                    onClick={() => handleSortChange('city')}
                    title="Haz clic para ordenar"
                  >
                    Ciudad{getSortIndicator('city')}
                  </th>
                  <th
                    className={`${styles.th} ${styles.sortable}`}
                    onClick={() => handleSortChange('portalEmail')}
                    title="Haz clic para ordenar"
                  >
                    Usuario{getSortIndicator('portalEmail')}
                  </th>
                  <th
                    className={`${styles.th} ${styles.sortable}`}
                    onClick={() => handleSortChange('isActive')}
                    title="Haz clic para ordenar"
                  >
                    Estado{getSortIndicator('isActive')}
                  </th>
                  <th className={`${styles.th} ${styles.center}`}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sortedBranches.map((branch) => (
                  <tr key={branch.id} className={styles.bodyRow}>
                    <td className={styles.td}>
                      {branch.logoUrl ? (
                        <div className={styles.logoCell}>
                          <img
                            src={getAssetUrl(branch.logoUrl)}
                            alt={branch.name}
                            className={styles.logoImg}
                          />
                        </div>
                      ) : getDefaultLogo() ? (
                        <div className={styles.logoCell}>
                          <img
                            src={getAssetUrl(getDefaultLogo())}
                            alt="Default"
                            className={styles.logoImg}
                          />
                        </div>
                      ) : (
                        <div className={`${styles.logoCell} ${styles.logoFallback}`}>
                          -
                        </div>
                      )}
                    </td>
                    <td className={styles.td}>
                      <div className={styles.branchName}>{branch.name}</div>
                      <div className={styles.branchMeta}>
                        {branch.branchNumber ? `#${branch.branchNumber}` : '-'}
                      </div>
                    </td>
                    <td className={styles.td}>
                      <div className={styles.cityText}>{branch.city || '-'}</div>
                      {branch.state && (
                        <div className={styles.cityMeta}>{branch.state}</div>
                      )}
                    </td>
                    <td className={styles.td}>
                      <div className={styles.emailMono}>{branch.portalEmail || '-'}</div>
                    </td>
                    <td className={styles.td}>
                      <span
                        className={`${styles.status} ${branch.isActive !== false ? styles.statusActive : styles.statusInactive}`}
                      >
                        {branch.isActive !== false ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className={`${styles.td} ${styles.center}`}>
                      <div className={styles.inlineActions}>
                      <button
                        className={`button-secondary ${styles.smallBtn}`}
                        onClick={() => handleBranchEdit(branch)}
                        disabled={saving}
                        type="button"
                      >
                        Editar
                      </button>
                      <button
                        className={`button-secondary ${styles.smallBtn} ${styles.deleteBtn}`}
                        onClick={() => handleBranchDelete(branch.id)}
                        disabled={saving}
                        type="button"
                      >
                        Eliminar
                      </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {sortedBranches.length === 0 && searchTerm && (
            <div className={styles.emptyHint}>
              No se encontraron sucursales que coincidan con "{searchTerm}"
            </div>
          )}
        </div>
      )}

      {branches.length === 0 && !editingBranchId && (
        <div className={styles.emptyBase}>
          No tienes sucursales aún. Crea una para comenzar.
        </div>
      )}
    </div>
  );
};

export default BranchesForm;

