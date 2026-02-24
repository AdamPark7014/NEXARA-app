"use client";
import React, { useEffect, useRef, useState } from 'react';
import ClientLocationPicker, { ClientLocationValue } from './ClientLocationPicker';

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
      setError('El numero de sucursal es obligatorio');
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

  const formCardStyle: React.CSSProperties = {
    background: 'linear-gradient(140deg, rgba(31,137,252,0.22), rgba(20,162,133,0.18)), var(--surface)',
    border: '1px solid rgba(31,137,252,0.22)',
    borderRadius: 16,
    padding: 18,
    display: 'grid',
    gap: 12,
    boxShadow: '0 14px 24px rgba(15,106,214,0.16)',
  };

  const formGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 12,
  };

  const logoBoxStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
    alignItems: 'start',
  };

  const defaultLogoStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--surface)',
    border: '1px dashed var(--border)',
    borderRadius: 8,
    padding: 12,
    minHeight: 100,
    fontSize: 12,
    color: 'var(--text-secondary)',
    textAlign: 'center',
  };

  const logoUploadStyle: React.CSSProperties = {
    display: 'grid',
    gap: 8,
  };

  const tableSectionStyle: React.CSSProperties = {
    marginTop: 24,
    display: 'grid',
    gap: 12,
  };

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      {/* Formulario de creación/edición */}
      <div style={formCardStyle}>
        <h3 style={{ margin: '0 0 12px 0', color: 'var(--primary)' }}>
          {editingBranchId ? 'Editar sucursal' : 'Crear nueva sucursal'}
        </h3>

        {error && (
          <div
            style={{
              padding: 12,
              background: 'rgba(255, 76, 76, 0.1)',
              border: '1px solid rgba(255, 76, 76, 0.3)',
              borderRadius: 8,
              color: 'var(--error)',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {/* Logo section */}
        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Logo de la sucursal
          </label>
          <div style={logoBoxStyle}>
            {/* Current/Default Logo */}
            <div style={defaultLogoStyle}>
              {logoPreview ? (
                <img src={logoPreview} alt="Logo preview" style={{ maxHeight: '100%', maxWidth: '100%' }} />
              ) : getDefaultLogo() ? (
                <img src={getAssetUrl(getDefaultLogo())} alt="Default logo" style={{ maxHeight: '100%', maxWidth: '100%' }} />
              ) : (
                <span>Sin logo (usará el logo de la empresa)</span>
              )}
            </div>

            {/* Upload Area */}
            <div
              style={{
                ...logoUploadStyle,
                padding: 12,
                background: logoDragging ? 'rgba(31,137,252,0.1)' : 'transparent',
                border: `2px dashed ${logoDragging ? 'var(--primary)' : 'var(--border)'}`,
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setLogoDragging(true);
              }}
              onDragLeave={() => setLogoDragging(false)}
              onDrop={handleLogoDrop}
              onClick={() => logoInputRef.current?.click()}
            >
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center' }}>
                Arrastra una imagen aquí o haz clic para seleccionar
              </span>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => handleLogoSelect(e.target.files?.[0])}
              />
            </div>
          </div>
        </div>

        {/* Datos básicos */}
        <div style={formGridStyle}>
          <input
            className="input"
            placeholder="Nombre de la sucursal"
            value={branchDraft.name}
            onChange={(e) => setBranchDraft({ ...branchDraft, name: e.target.value })}
          />
          <input
            className="input"
            placeholder="Numero de sucursal"
            value={branchDraft.branchNumber}
            onChange={(e) => setBranchDraft({ ...branchDraft, branchNumber: e.target.value })}
          />
        </div>

        {/* Ubicación */}
        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Ubicacion de la sucursal
          </label>
          <ClientLocationPicker
            label="Busca la ubicacion en Google Maps"
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
        <div style={{ ...formGridStyle, gridTemplateColumns: '1fr' }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Perfil de sucursal</label>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
              Crea usuarios internos para cada sucursal. Usaran estas credenciales en tickets.nexara.com.mx.
            </p>
          </div>
        </div>

        <div style={formGridStyle}>
          <input
            className="input"
            placeholder="Usuario acceso sucursal (email)"
            value={branchDraft.portalEmail}
            onChange={(e) => setBranchDraft({ ...branchDraft, portalEmail: e.target.value })}
            type="email"
          />
          <div style={{ position: 'relative' }}>
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
              style={{
                position: 'absolute',
                right: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                padding: 6,
                fontSize: 14,
              }}
              title={showPassword ? 'Ocultar' : 'Mostrar'}
            >
              {showPassword ? '👁️' : '👁️‍🗨️'}
            </button>
          </div>
        </div>

        {/* Estado activo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: 0 }}>
            <input
              type="checkbox"
              checked={branchDraft.isActive}
              onChange={(e) => setBranchDraft({ ...branchDraft, isActive: e.target.checked })}
              style={{ cursor: 'pointer' }}
            />
            <span style={{ fontSize: 13 }}>Sucursal activa</span>
          </label>
        </div>

        {/* Botones de acción */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
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

      {/* Tabla de sucursales con búsqueda, orden y exportación */}
      {branches.length > 0 && (
        <div style={tableSectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
            <h3 style={{ margin: 0, color: 'var(--primary)' }}>Mis sucursales ({sortedBranches.length})</h3>
            <button
              className="button-secondary"
              onClick={handleExportCSV}
              type="button"
              style={{ fontSize: 12, padding: '8px 12px' }}
            >
              📥 Exportar CSV
            </button>
          </div>

          {/* Búsqueda */}
          <div style={{ marginBottom: 12 }}>
            <input
              className="input"
              placeholder="🔍 Buscar sucursal por nombre, número, ciudad, email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: '100%' }}
            />
            {searchTerm && (
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
                Se encontraron {sortedBranches.length} resultado(s)
              </div>
            )}
          </div>

          {/* Tabla */}
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 13,
              }}
            >
              <thead>
                <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: 12, textAlign: 'left' }}>Logo</th>
                  <th
                    style={{ padding: 12, textAlign: 'left', cursor: 'pointer', userSelect: 'none', fontWeight: 'bold' }}
                    onClick={() => handleSortChange('name')}
                    title="Haz clic para ordenar"
                  >
                    Sucursal{getSortIndicator('name')}
                  </th>
                  <th
                    style={{ padding: 12, textAlign: 'left', cursor: 'pointer', userSelect: 'none', fontWeight: 'bold' }}
                    onClick={() => handleSortChange('city')}
                    title="Haz clic para ordenar"
                  >
                    Ciudad{getSortIndicator('city')}
                  </th>
                  <th
                    style={{ padding: 12, textAlign: 'left', cursor: 'pointer', userSelect: 'none', fontWeight: 'bold' }}
                    onClick={() => handleSortChange('portalEmail')}
                    title="Haz clic para ordenar"
                  >
                    Usuario{getSortIndicator('portalEmail')}
                  </th>
                  <th
                    style={{ padding: 12, textAlign: 'left', cursor: 'pointer', userSelect: 'none', fontWeight: 'bold' }}
                    onClick={() => handleSortChange('isActive')}
                    title="Haz clic para ordenar"
                  >
                    Estado{getSortIndicator('isActive')}
                  </th>
                  <th style={{ padding: 12, textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sortedBranches.map((branch) => (
                  <tr key={branch.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: 12 }}>
                      {branch.logoUrl ? (
                        <div
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 8,
                            overflow: 'hidden',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'var(--surface)',
                          }}
                        >
                          <img
                            src={getAssetUrl(branch.logoUrl)}
                            alt={branch.name}
                            style={{ maxHeight: '100%', maxWidth: '100%' }}
                          />
                        </div>
                      ) : getDefaultLogo() ? (
                        <div
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 8,
                            overflow: 'hidden',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'var(--surface)',
                          }}
                        >
                          <img
                            src={getAssetUrl(getDefaultLogo())}
                            alt="Default"
                            style={{ maxHeight: '100%', maxWidth: '100%' }}
                          />
                        </div>
                      ) : (
                        <div
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 8,
                            background: 'var(--surface)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 12,
                            color: 'var(--text-secondary)',
                          }}
                        >
                          -
                        </div>
                      )}
                    </td>
                    <td style={{ padding: 12 }}>
                      <div style={{ fontWeight: 600 }}>{branch.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {branch.branchNumber ? `#${branch.branchNumber}` : '-'}
                      </div>
                    </td>
                    <td style={{ padding: 12 }}>
                      <div style={{ fontSize: 12 }}>{branch.city || '-'}</div>
                      {branch.state && (
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{branch.state}</div>
                      )}
                    </td>
                    <td style={{ padding: 12 }}>
                      <div style={{ fontSize: 11, fontFamily: 'monospace' }}>{branch.portalEmail || '-'}</div>
                    </td>
                    <td style={{ padding: 12 }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '6px 12px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          background: branch.isActive !== false ? 'rgba(76, 175, 80, 0.1)' : 'rgba(255, 76, 76, 0.1)',
                          color: branch.isActive !== false ? '#4caf50' : '#ff4c4c',
                        }}
                      >
                        {branch.isActive !== false ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td style={{ padding: 12, textAlign: 'center' }}>
                      <button
                        className="button-secondary"
                        onClick={() => handleBranchEdit(branch)}
                        disabled={saving}
                        type="button"
                        style={{ fontSize: 12, padding: '6px 8px' }}
                      >
                        Editar
                      </button>
                      <button
                        className="button-secondary"
                        onClick={() => handleBranchDelete(branch.id)}
                        disabled={saving}
                        type="button"
                        style={{ fontSize: 12, padding: '6px 8px', marginLeft: 4, color: '#ff4c4c' }}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {sortedBranches.length === 0 && searchTerm && (
            <div
              style={{
                textAlign: 'center',
                padding: 24,
                color: 'var(--text-secondary)',
                fontSize: 13,
              }}
            >
              No se encontraron sucursales que coincidan con "{searchTerm}"
            </div>
          )}
        </div>
      )}

      {branches.length === 0 && !editingBranchId && (
        <div
          style={{
            textAlign: 'center',
            padding: 24,
            color: 'var(--text-secondary)',
            fontSize: 13,
          }}
        >
          No tienes sucursales aún. Crea una para comenzar.
        </div>
      )}
    </div>
  );
};

export default BranchesForm;
