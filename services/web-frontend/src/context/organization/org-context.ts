import { createContext } from 'react';
import type { Organization } from '@/api/types';

export interface OrgContextType {
  selectedOrg: Organization | null;
  setSelectedOrg: (org: Organization | null) => void;
}

export const OrgContext = createContext<OrgContextType>({
  selectedOrg: null,
  setSelectedOrg: () => {}
});
