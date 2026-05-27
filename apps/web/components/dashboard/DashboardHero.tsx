/**
 * Encabezado del Dashboard — saludo + selector de usuario (sólo console admin).
 *
 * Antes este bloque vivía dentro del monolito `Dashboard.tsx` mezclando
 * lógica de auth, formateo y UI. Ahora recibe sólo lo que necesita pintar.
 */

import type { AttendanceRangeUser, WeekRange } from './types';
import { formatDate } from './utils';

type Props = {
  user: { nombre: string; role?: string; isSuperAdmin?: boolean };
  userName: string;
  weekRange: WeekRange;
  isConsoleAdmin: boolean;
  availableUsers: AttendanceRangeUser[];
  activeUserId: number | null;
  onChangeUser: (userId: number) => void;
};

export default function DashboardHero({
  user,
  userName,
  weekRange,
  isConsoleAdmin,
  availableUsers,
  activeUserId,
  onChangeUser,
}: Props) {
  return (
    <div className="heroCard">
      <div className="heroHeader">
        <div>
          <p className="heroKicker">Panel Console</p>
          <h1 className="heroTitle">Resumen semanal operativo</h1>
          <div className="heroSubtitle">
            {userName} · Semana {weekRange.from} a {weekRange.to}
          </div>
        </div>
        <div className="heroMeta">
          <div className="heroRole">{user.role}</div>
          {user.isSuperAdmin && <div className="heroLevel">Superadmin</div>}
        </div>
      </div>
      <div className="heroBadges">
        <span className="chip">
          Semana: {formatDate(weekRange.from)} - {formatDate(weekRange.to)}
        </span>
        <span className="chip chipLive">Usuario: {userName}</span>
      </div>
      {isConsoleAdmin && availableUsers.length > 0 && (
        <div className="filtersRow">
          <label className="filterControl">
            <span className="filterLabel">Usuario</span>
            <select
              className="input"
              value={activeUserId ?? ''}
              onChange={(event) => onChangeUser(Number(event.target.value))}
            >
              {availableUsers.map((item) => (
                <option key={item.userId} value={item.userId}>
                  {item.userName || `Usuario ${item.userId}`}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
