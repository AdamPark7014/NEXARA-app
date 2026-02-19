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
}

interface UserContextType {
	user: User | null;
	setUser: (user: User | null) => void;
	logout: () => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: ReactNode }) => {
	const [user, setUser] = useState<User | null>(null);

	useEffect(() => {
		// Cargar usuario desde sessionStorage para evitar conflictos entre pestañas
		const stored = sessionStorage.getItem('nexara_user');
		if (stored) setUser(JSON.parse(stored));
	}, []);

	useEffect(() => {
		if (user) sessionStorage.setItem('nexara_user', JSON.stringify(user));
		else sessionStorage.removeItem('nexara_user');
	}, [user]);

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
