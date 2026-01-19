"use client";

import dynamic from 'next/dynamic';
import React, { useEffect } from 'react';
import { useUser } from '../../components/UserContext';
import { useRouter } from 'next/navigation';

const Dashboard = dynamic(() => import('../../components/Dashboard'), { ssr: false });

export default function DashboardPage() {
  const { user } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!user) {
      router.replace('/login');
    }
  }, [user, router]);

  if (!user) return null;
  return <Dashboard />;
}
