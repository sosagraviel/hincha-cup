import { useState, type ReactNode } from 'react';
import type { Organization } from '@/api/types';
import { OrgContext } from './org-context';

export function OrgProvider({ children }: { children: ReactNode }) {
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);

  return (
    <OrgContext.Provider value={{ selectedOrg, setSelectedOrg }}>
      {children}
    </OrgContext.Provider>
  );
}
