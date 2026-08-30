"use client";
import { consumeHandoffParam } from '@/lib/cross-panel-handoff';
import { consumeFreshLoginIntent, isBrowserLoginPath } from '@/lib/tab-session';
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { clearActivePanel } from '@/lib/panel-routing';
import { isCapacitorNative } from '@/lib/capacitor-env';
import { buildApiUrl } from '@/lib/api-base';
import { getSharedCookie, deleteSharedCookie, setSharedCookie, SHARED_COOKIE_KEYS } from '@/lib/shared-cookies';

export interface User {
	id: number;
	nombre: string;
	email: string;
	role: string;
	roleId?: number;
	orgRoleKey?: string | null;
	/** RBAC v2 — clave normalizada (super_admin, ceo, dir_admin, vendedor, …) */
	roleKey?: string | null;
	nivelAutoridad?: number;
	roleFlags?: {
		accesoConsole?: boolean;
		accesoConsoleAdmin?: boolean;
		accesoActividades?: boolean;
		accesoEvidencias?: boolean;
		accesoViaticos?: boolean;
		accesoVehiculos?: boolean;
		accesoAsistencia?: boolean;
		accesoGps?: boolean;
		accesoGestionUsuarios?: boolean;
		accesoGestionWeb?: boolean;
		accesoGestionCvs?: boolean;
		accesoPanelVentas?: boolean;
		accesoContabilidad?: boolean;
		accesoCotizaciones?: boolean;
		accesoInventario?: boolean;
		accesoCompras?: boolean;
		accesoMantenimiento?: boolean;
		accesoDocumentos?: boolean;
		accesoAuditoria?: boolean;
		accesoBI?: boolean;
		accesoBanca?: boolean;
		accesoMultas?: boolean;
		accesoClientes?: boolean;
		accesoLunchBreaks?: boolean;
		accesoRRHH?: boolean;
		accesoCatalogo?: boolean;
	};
	department: string;
	departmentId: number;
	/**
	 * Antes el JWT en claro. Tras la migración a cookie `HttpOnly` contiene
	 * `SESSION_COOKIE_SENTINEL` en el navegador: sigue sirviendo como bandera de
	 * "hay sesión", pero ya no es un secreto robable por XSS.
	 */
	token: string;
	/** Caducidad de la sesión (ISO). La envía el login; sustituye a decodificar el JWT. */
	expiresAt?: string | null;
	avatarUrl?: string;
	permissions: string[];
	isSuperAdmin?: boolean;
	isPlatformOwner?: boolean;
	loginDevice?: string;
	/** Sesión sin validar token: solo UI offline (token puede estar vencido). */
	offlineDegraded?: boolean;
}

interface UserContextType {
	user: User | null;
	setUser: (user: User | null) => void;
	logout: () => void;
	isContextReady: boolean;
	/** JWT del usuario activo, o `null` si no hay sesión. Atajo de `user?.token`. */
	token: string | null;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

const USER_STORAGE_KEY = 'nexara_user';

/**
 * Marcador que ocupa el lugar del JWT en el estado persistido.
 *
 * La sesión vive ahora en una cookie `HttpOnly` que JavaScript no puede leer,
 * pero el navegador la envía sola en cada petición. El campo `token` se conserva
 * porque cientos de sitios lo usan como bandera de "hay sesión"
 * (`if (!user?.token) return`) y para construir la cabecera `Authorization`.
 *
 * El valor no es un JWT a propósito: la API descarta cualquier `Bearer` que no
 * tenga forma de JWT y cae a la cookie (ver `common/security/session-cookie.ts`).
 * Así no hubo que tocar ~300 puntos de llamada para completar la migración.
 */
export const SESSION_COOKIE_SENTINEL = 'session-cookie';

const normalizeUser = (value: unknown): User | null => {
	if (!value || typeof value !== 'object') return null;
	const candidate = value as Partial<User> & { permissions?: unknown };
	if (!candidate.id || !candidate.email) return null;

	return {
		id: Number(candidate.id),
		nombre: candidate.nombre || '',
		email: candidate.email,
		role: candidate.role || '',
		roleId: candidate.roleId,
		orgRoleKey: candidate.orgRoleKey ?? null,
		roleKey: candidate.roleKey ?? null,
		nivelAutoridad: Number(candidate.nivelAutoridad || 0),
		roleFlags: candidate.roleFlags,
		department: candidate.department || '',
		departmentId: Number(candidate.departmentId || 0),
		token: candidate.token || SESSION_COOKIE_SENTINEL,
		expiresAt: candidate.expiresAt ?? null,
		avatarUrl: candidate.avatarUrl,
		permissions: Array.isArray(candidate.permissions)
			? candidate.permissions.filter((item): item is string => typeof item === 'string')
			: [],
		isSuperAdmin: Boolean(candidate.isSuperAdmin),
		isPlatformOwner: Boolean(candidate.isPlatformOwner),
		loginDevice: candidate.loginDevice,
		offlineDegraded: Boolean(candidate.offlineDegraded),
	};
};

/**
 * Caducidad de la sesión.
 *
 * Con la cookie en `HttpOnly` ya no se puede decodificar el JWT en el cliente,
 * así que se usa el `expiresAt` que devuelve el login. Si falta (sesión anterior
 * a la migración, o token aún legible) se recurre al JWT como antes.
 *
 * Sin ninguna de las dos referencias se considera **no** caducada: la autoridad
 * real es la API, que responderá 401 si la sesión ya no vale. Asumir lo
 * contrario expulsaría a usuarios con sesión válida.
 */
const isSessionExpired = (user: Pick<User, 'token' | 'expiresAt'>): boolean => {
	if (user.expiresAt) {
		const expiresMs = Date.parse(user.expiresAt);
		if (Number.isFinite(expiresMs)) {
			// Se considera caducada con menos de 60 s de margen.
			return expiresMs < Date.now() + 60_000;
		}
	}

	const parts = (user.token || '').split('.');
	if (parts.length !== 3) return false;

	try {
		const payload = JSON.parse(atob(parts[1]));
		if (!payload.exp) return false;
		return payload.exp * 1000 < Date.now() + 60_000;
	} catch {
		return false;
	}
};

const safeGetStoredUser = (): User | null => {
	if (typeof window === 'undefined') return null;

	const parseStored = (raw: string | null) => {
		if (!raw) return null;
		try {
			return normalizeUser(JSON.parse(raw));
		} catch {
			return null;
		}
	};

	const migrateLocalToSession = (u: User): void => {
		try {
			const { offlineDegraded: _omit, ...persistable } = u;
			window.sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(persistable));
			window.localStorage.removeItem(USER_STORAGE_KEY);
		} catch {
			/* ignore */
		}
	};

	// 1. Sesión de ESTA pestaña (prioridad — permite CEO + ing en paralelo)
	try {
		const sessionCandidate = parseStored(window.sessionStorage.getItem(USER_STORAGE_KEY));
		if (sessionCandidate) return sessionCandidate;
	} catch {
		// Ignore storage access errors (Safari private mode, etc.)
	}

	// 2. Cookies compartidas: solo si esta pestaña no tiene sesión propia
	//    (salto cross-subdominio). En /login no hidratar desde cookie para
	//    permitir iniciar sesión con otra cuenta en una pestaña nueva.
	const skipCookieHydration = isBrowserLoginPath();
	if (!skipCookieHydration) {
		try {
			const cookieUserStr = getSharedCookie(SHARED_COOKIE_KEYS.USER);
			const cookieUser = parseStored(cookieUserStr);
			if (cookieUser) {
				try {
					const { offlineDegraded: _omit, ...persistable } = cookieUser;
					window.sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(persistable));
				} catch {
					/* ignore */
				}
				return cookieUser;
			}
		} catch {
			// Ignore cookie read errors
		}
	}

	// 3. Fallback: localStorage legacy (app nativa / migración)
	const native = isCapacitorNative();

	try {
		const localCandidate = parseStored(window.localStorage.getItem(USER_STORAGE_KEY));
		if (!localCandidate) return null;
		if (native) return localCandidate;
		// Navegador: una sesión por pestaña — migrar legacy localStorage → session y no compartir entre tabs
		migrateLocalToSession(localCandidate);
		return localCandidate;
	} catch {
		return null;
	}
};

/**
 * Cookie ligera leída por `apps/web/middleware.ts` para protección del lado
 * del servidor: si no existe, el middleware redirige cualquier ruta de panel
 * (`/erp/...`, `/crm/...`, `/ops/...`, `/studio/...`, `/lab/...`) a `/login`
 * ANTES de renderizar — eliminando el flash de UI sin sidebar.
 *
 * No contiene secretos: solo señaliza "hay una sesión activa en este
 * navegador". El JWT real sigue en sessionStorage.
 *
 * Nota: configuramos `Secure` solo cuando estamos en HTTPS para no romper
 * el desarrollo local en `http://localhost`.
 */
const SESSION_COOKIE = 'nx_session';
const setSessionCookie = (active: boolean) => {
	if (typeof document === 'undefined') return;
	const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
	const isProduction = typeof window !== 'undefined' && window.location.hostname.includes('nexara.com.mx');
	const secureFlag = isHttps ? '; Secure' : '';
	// Compartir nx_session entre todos los subdominios en producción para que el
	// middleware auth-gate la vea al navegar cross-subdomain (ej. sales → core).
	const domainFlag = isProduction ? '; Domain=.nexara.com.mx' : '';
	if (active) {
		document.cookie = `${SESSION_COOKIE}=1; Path=/; SameSite=Lax; Max-Age=86400${domainFlag}${secureFlag}`;
	} else {
		document.cookie = `${SESSION_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0${domainFlag}${secureFlag}`;
	}
};

const safePersistUser = (user: User | null) => {
	if (typeof window === 'undefined') return;

	const write = (storage: Storage) => {
		if (user) {
			const { offlineDegraded: _omit, ...persistable } = user;
			// En navegador el JWT NO se persiste: `sessionStorage` es tan legible
			// por XSS como una cookie sin `HttpOnly`, así que guardar el token ahí
			// anularía la migración. La sesión real viaja en la cookie `HttpOnly`
			// que emite el servidor; aquí queda solo el marcador.
			//
			// La app nativa sí conserva el JWT: no usa cookie de sesión y autentica
			// con la cabecera `Authorization`.
			const safeToPersist = isCapacitorNative()
				? persistable
				: { ...persistable, token: SESSION_COOKIE_SENTINEL };
			storage.setItem(USER_STORAGE_KEY, JSON.stringify(safeToPersist));
			return;
		}
		storage.removeItem(USER_STORAGE_KEY);
	};

	try {
		write(window.sessionStorage);
	} catch {
		// Ignore storage access errors
	}

	if (isCapacitorNative()) {
		try {
			write(window.localStorage);
		} catch {
			// Ignore storage access errors
		}
	} else {
		try {
			window.localStorage.removeItem(USER_STORAGE_KEY);
		} catch {
			/* ignore */
		}
	}

	// Cookies compartidas: solo app nativa (en navegador cada pestaña es independiente)
	if (isCapacitorNative() && typeof document !== 'undefined') {
		if (user) {
			const { offlineDegraded: _omit, ...persistable } = user;
			setSharedCookie(SHARED_COOKIE_KEYS.USER, JSON.stringify(persistable), {
				maxAge: 86400,
				sameSite: 'Lax',
			});
			setSharedCookie(SHARED_COOKIE_KEYS.ACCESS_TOKEN, user.token, {
				maxAge: 86400,
				sameSite: 'Lax',
			});
		} else {
			deleteSharedCookie(SHARED_COOKIE_KEYS.USER);
			deleteSharedCookie(SHARED_COOKIE_KEYS.ACCESS_TOKEN);
		}
	}

	setSessionCookie(Boolean(user?.token));
};

export const UserProvider = ({ children }: { children: ReactNode }) => {
	const [user, setUser] = useState<User | null>(null);
	const [isContextReady, setIsContextReady] = useState(false);

	useEffect(() => {
		let cancelled = false;

		const syncProfile = async (storedUser: User) => {
			try {
				const response = await fetch(buildApiUrl('auth/profile'), {
					headers: { Authorization: `Bearer ${storedUser.token}` },
					cache: 'no-store',
				});

				if (cancelled) return;

				if (response.status === 401 || response.status === 403) {
					safePersistUser(null);
					setUser(null);
					return;
				}

				if (!response.ok) return;

				const profile = await response.json();
				if (cancelled) return;

				const normalizedProfile = normalizeUser({
					...profile,
					token: storedUser.token,
					loginDevice: storedUser.loginDevice,
				});

				if (normalizedProfile) {
					setUser((prev) => {
						if (!prev) return normalizedProfile;
						if (prev.token !== storedUser.token) return prev;
						return normalizedProfile;
					});
				}
			} catch {
				// Keep local session user if profile sync fails transiently.
			}
		};

		// ?fresh=1 en /login: vaciar sesión de esta pestaña antes de hidratar
		consumeFreshLoginIntent();

		// Cross-subdomain SSO: consume ?_nxt= handoff token first
		const handoffJson = consumeHandoffParam();
		if (handoffJson) {
			try {
				const handoffUser = normalizeUser(JSON.parse(handoffJson));
				if (handoffUser && !isSessionExpired(handoffUser)) {
					safePersistUser(handoffUser);
					setUser(handoffUser);
					setIsContextReady(true);
					const online = typeof navigator !== "undefined" && navigator.onLine;
					if (online) void syncProfile(handoffUser);
					return;
				}
			} catch { /* fallthrough to normal flow */ }
		}

		const storedUser = safeGetStoredUser();
		const online = typeof navigator !== "undefined" && navigator.onLine;
		if (storedUser) {
			if (isSessionExpired(storedUser)) {
				if (!online) {
					setUser({ ...storedUser, offlineDegraded: true });
				} else {
					safePersistUser(null);
				}
			} else {
				setUser(storedUser);
				if (online) {
					void syncProfile(storedUser);
				}
			}
		}
		setIsContextReady(true);

		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		const onOnline = () => {
			setUser((prev) => {
				if (!prev?.offlineDegraded) return prev;
				if (isSessionExpired(prev)) {
					safePersistUser(null);
					return null;
				}
				const { offlineDegraded: _o, ...rest } = prev;
				return rest;
			});
		};
		window.addEventListener("online", onOnline);
		return () => window.removeEventListener("online", onOnline);
	}, []);

	useEffect(() => {
		safePersistUser(user);
	}, [user]);

	// Sliding session: renovar JWT cada ~15 min y al volver el foco/visibility.
	useEffect(() => {
		if (!user?.token || user.offlineDegraded) return;

		let cancelled = false;

		const extend = async () => {
			try {
				const response = await fetch(buildApiUrl('auth/session/extend'), {
					method: 'POST',
					credentials: 'include',
					headers: { Authorization: `Bearer ${user.token}` },
					cache: 'no-store',
				});
				if (cancelled) return;
				if (response.status === 401 || response.status === 403) {
					safePersistUser(null);
					setUser(null);
					return;
				}
				if (!response.ok) return;
				const data = await response.json();
				if (cancelled || !data?.expiresAt) return;
				setUser((prev) => {
					if (!prev || prev.token !== user.token) return prev;
					return { ...prev, expiresAt: data.expiresAt };
				});
			} catch {
				/* red intermitente: no expulsar */
			}
		};

		const onFocusOrVisible = () => {
			if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
			void extend();
		};

		const intervalId = window.setInterval(() => void extend(), 15 * 60_000);
		window.addEventListener('focus', onFocusOrVisible);
		document.addEventListener('visibilitychange', onFocusOrVisible);

		return () => {
			cancelled = true;
			window.clearInterval(intervalId);
			window.removeEventListener('focus', onFocusOrVisible);
			document.removeEventListener('visibilitychange', onFocusOrVisible);
		};
	}, [user?.token, user?.offlineDegraded]);



	const logout = () => {
		clearActivePanel();
		setUser(null);
		// Cerrar sesión global (cookies legacy / otras pestañas sin sesión propia)
		if (typeof document !== 'undefined' && !isCapacitorNative()) {
			deleteSharedCookie(SHARED_COOKIE_KEYS.USER);
			deleteSharedCookie(SHARED_COOKIE_KEYS.ACCESS_TOKEN);
		}
		// La cookie de sesión es `HttpOnly`: solo el servidor puede borrarla.
		// Sin esta llamada la sesión seguiría viva pese al logout en la UI.
		void fetch(buildApiUrl('auth/logout'), {
			method: 'POST',
			credentials: 'include',
		}).catch(() => {
			/* el logout local no debe fallar por un error de red */
		});
	};

	return (
		<UserContext.Provider value={{ user, setUser, logout, isContextReady, token: user?.token ?? null }}>
			{children}
		</UserContext.Provider>
	);
};

export const useUser = () => {
	const ctx = useContext(UserContext);
	if (!ctx) throw new Error('useUser must be used within UserProvider');
	return ctx;
};
