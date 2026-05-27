import type { ReactNode } from 'react';
import RbacPageGuard from '@/components/rbac/RbacPageGuard';

export default function CoreLayout({ children }: { children: ReactNode }) {
  return <RbacPageGuard>{children}</RbacPageGuard>;
}
