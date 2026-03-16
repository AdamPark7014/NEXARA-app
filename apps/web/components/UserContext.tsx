"use client";
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface User {
	id: number;
	nombre: string;
	email: string;
	role: string;
	roleId?: number;
	department: string;
	departmentId: number;
	token: string;
	avatarUrl?: string;
	permissions: string[];
	isSuperAdmin?: boolean;
	loginDevice?: string;
}

interface UserContextType {
	user: User | null;
	setUser: (user: User | null) => void;
	logout: () => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

const USER_STORAGE_KEY = 'nexara_user';

const normalizeUser = (value: unknown): User | null => {
	if (!value || typeof value !== 'object') return null;
	const candidate = value as Partial<User> & { permissions?: unknown };
	if (!candidate.token || !candidate.id || !candidate.email) return null;

	return {
		id: Number(candidate.id),
		nombre: candidate.nombre || '',
		email: candidate.email,
		role: candidate.role || '',
		roleId: candidate.roleId,
		department: candidate.department || '',
		departmentId: Number(candidate.departmentId || 0),
		token: candidate.token,
		avatarUrl: candidate.avatarUrl,
		permissions: Array.isArray(candidate.permissions)
			? candidate.permissions.filter((item): item is string => typeof item === 'string')
			: [],
		isSuperAdmin: Boolean(candidate.isSuperAdmin),
		loginDevice: candidate.loginDevice,
	};
};

const isTokenExpired = (token: string): boolean => {
	try {
		const parts = token.split('.');
		if (parts.length !== 3) return true;
		const payload = JSON.parse(atob(parts[1]));
		if (!payload.exp) return false;
		// Consider expired if less than 60 seconds remaining
		return payload.exp * 1000 < Date.now() + 60_000;
	} catch {
		return true;
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

	try {
		const sessionCandidate = parseStored(window.sessionStorage.getItem(USER_STORAGE_KEY));
		if (sessionCandidate) return sessionCandidate;
	} catch {
		// Ignore storage access errors (Safari private mode, etc.)
	}

	try {
		const localCandidate = parseStored(window.localStorage.getItem(USER_STORAGE_KEY));
		if (localCandidate) return localCandidate;
	} catch {
		// Ignore storage access errors (Safari private mode, etc.)
	}

	return null;
};

const safePersistUser = (user: User | null) => {
	if (typeof window === 'undefined') return;

	const write = (storage: Storage) => {
		if (user) {
			storage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
			return;
		}
		storage.removeItem(USER_STORAGE_KEY);
	};

	try {
		write(window.sessionStorage);
	} catch {
		// Ignore storage access errors
	}

	try {
		write(window.localStorage);
	} catch {
		// Ignore storage access errors
	}
};

export const UserProvider = ({ children }: { children: ReactNode }) => {
	const [user, setUser] = useState<User | null>(null);

	useEffect(() => {
		const storedUser = safeGetStoredUser();
		if (storedUser) {
			if (isTokenExpired(storedUser.token)) {
				safePersistUser(null);
			} else {
				setUser(storedUser);
			}
		}
	}, []);

	useEffect(() => {
		safePersistUser(user);
	}, [user]);

	// Cross-tab sync: if another tab logs out, reflect it here
	useEffect(() => {
		const handleStorage = (e: StorageEvent) => {
			if (e.key !== USER_STORAGE_KEY) return;
			if (!e.newValue) {
				setUser(null);
			} else {
				const parsed = normalizeUser((() => { try { return JSON.parse(e.newValue); } catch { return null; } })());
				if (parsed && !isTokenExpired(parsed.token)) {
					setUser(parsed);
				}
			}
		};
		window.addEventListener('storage', handleStorage);
		return () => window.removeEventListener('storage', handleStorage);
	}, []);

	const logout = () => setUser(null);

	return (
		<UserContext.Provider value={{ user, setUser, logout }}>
			{children}
		</UserContext.Provider>
	);
};

export const useUser = () => {
	const ctx = useContext(UserContext);
	if (!ctx) throw new Error('useUser must be used within UserProvider');
	return ctx;
};
