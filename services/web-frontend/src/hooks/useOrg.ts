import { useContext } from 'react';
import { OrgContext } from '@/context/organization/org-context';

export function useOrg() {
  return useContext(OrgContext);
}
