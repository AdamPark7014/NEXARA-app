import type { ReactNode } from 'react';
import RbacPageGuard from '@/components/rbac/RbacPageGuard';

export default function SalesLayout({ children }: { children: ReactNode }) {
  return <RbacPageGuard>{children}</RbacPageGuard>;
}
