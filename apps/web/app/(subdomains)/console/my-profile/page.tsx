import { RoleGuard } from '@/components/RoleGuard';
import MyProfileForm from '@/components/MyProfileForm';
import { PERMISSIONS } from '@/lib/permissions';

export default function MyProfilePage() {
  return (
    <RoleGuard anyPermissions={[PERMISSIONS.CONSOLE_ACCESS, PERMISSIONS.CONSOLE_ADMIN]}>
      <div style={{ display: 'grid', gap: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <h1 style={{ color: 'var(--primary)', marginBottom: 8 }}>Mi perfil</h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Completa tu información personal y sube tu documentación.
          </p>
        </div>
        <MyProfileForm />
      </div>
    </RoleGuard>
  );
}
