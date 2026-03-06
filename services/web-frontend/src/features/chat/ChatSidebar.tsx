import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { ChatRoomItem } from './ChatRoomItem';
import { DmThreadItem } from './DmThreadItem';
import type { ChatRoom, DmThread } from '@/api/types';

type ChatTarget = { type: 'room'; id: string } | { type: 'dm'; id: string };

interface ChatSidebarProps {
  rooms: ChatRoom[];
  dmThreads: DmThread[];
  currentUserId: string;
  activeTarget: ChatTarget | null;
  onSelectRoom: (roomId: string) => void;
  onSelectDm: (dmThreadId: string) => void;
  onCreateRoom: () => void;
}

export function ChatSidebar({
  rooms,
  dmThreads,
  currentUserId,
  activeTarget,
  onSelectRoom,
  onSelectDm,
  onCreateRoom
}: ChatSidebarProps) {
  const [search, setSearch] = useState('');

  const filteredRooms = rooms.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase())
  );

  const filteredDms = dmThreads.filter(dm => {
    const other = dm.user1Id === currentUserId ? dm.user2 : dm.user1;
    return (other?.fullName ?? '').toLowerCase().includes(search.toLowerCase());
  });

  return (
    <aside className="flex flex-col w-64 border-r border-zinc-200 bg-white">
      {/* Search */}
      <div className="p-3">
        <div className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-1.5">
          <Search className="size-4 text-zinc-400 shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="flex-1 text-sm bg-transparent outline-none placeholder:text-zinc-400"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {/* Rooms section */}
        <div className="mb-4">
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Channels
            </span>
            <button
              onClick={onCreateRoom}
              className="p-0.5 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition-colors"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          {filteredRooms.length === 0 ? (
            <p className="px-3 text-xs text-zinc-400">No channels yet</p>
          ) : (
            filteredRooms.map(room => (
              <ChatRoomItem
                key={room.id}
                room={room}
                isActive={
                  activeTarget?.type === 'room' && activeTarget.id === room.id
                }
                onClick={() => onSelectRoom(room.id)}
              />
            ))
          )}
        </div>

        {/* DM section */}
        <div>
          <div className="flex items-center px-3 py-1.5">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Direct Messages
            </span>
          </div>
          {filteredDms.length === 0 ? (
            <p className="px-3 text-xs text-zinc-400">No conversations</p>
          ) : (
            filteredDms.map(dm => (
              <DmThreadItem
                key={dm.id}
                thread={dm}
                currentUserId={currentUserId}
                isActive={
                  activeTarget?.type === 'dm' && activeTarget.id === dm.id
                }
                onClick={() => onSelectDm(dm.id)}
              />
            ))
          )}
        </div>
      </div>
    </aside>
  );
}

export type { ChatTarget };
