import type { User } from '../../responses';

export interface DmThread {
  id: string;
  user1Id: string;
  user2Id: string;
  createdAt: string;
  user1?: User;
  user2?: User;
}
