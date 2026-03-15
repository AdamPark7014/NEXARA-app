"use client";
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { clearActivePanel } from '@/lib/panel-routing';

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
			setUser(storedUser);
		}
	}, []);

	useEffect(() => {
		safePersistUser(user);
	}, [user]);

	const logout = () => {
		clearActivePanel();
		setUser(null);
	};

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
