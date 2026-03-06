import { useState, useCallback } from 'react';
import { useCurrentUserQuery } from '@/hooks/queries/userQueries';
import {
  useRoomsQuery,
  useRoomMessagesQuery,
  useDmThreadsQuery,
  useDmMessagesQuery,
  useCreateRoomMutation,
  useSendMessageMutation,
  useDeleteMessageMutation
} from '@/hooks/queries/chatQueries';
import { ChatSidebar, type ChatTarget } from './ChatSidebar';
import { ChatHeader } from './ChatHeader';
import { ChatMessageList } from './ChatMessageList';
import { ChatMessageInput } from './ChatMessageInput';
import { CreateRoomDialog } from './CreateRoomDialog';
import { EmptyState } from '@/components/atoms/EmptyState';
import { GenericLoader } from '@/shared/ui/generic-loader';
import { MessageCircle } from 'lucide-react';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';

interface ChatPageProps {
  organizationId: string;
}

export function ChatPage({ organizationId }: ChatPageProps) {
  const { data: currentUser } = useCurrentUserQuery();
  const [activeTarget, setActiveTarget] = useState<ChatTarget | null>(null);
  const [showCreateRoom, setShowCreateRoom] = useState(false);

  const { data: rooms = [] } = useRoomsQuery(organizationId);
  const { data: dmThreads = [] } = useDmThreadsQuery();

  // Active room or DM messages
  const activeRoomId = activeTarget?.type === 'room' ? activeTarget.id : '';
  const activeDmId = activeTarget?.type === 'dm' ? activeTarget.id : '';

  const { data: roomMessages = [], isLoading: roomMsgsLoading } =
    useRoomMessagesQuery(activeRoomId);
  const { data: dmMessages = [], isLoading: dmMsgsLoading } =
    useDmMessagesQuery(activeDmId);

  const contextType = activeTarget?.type ?? 'room';
  const contextId = activeTarget?.id ?? '';

  const sendMutation = useSendMessageMutation(contextId, contextType);
  const deleteMutation = useDeleteMessageMutation(contextId, contextType);
  const createRoomMutation = useCreateRoomMutation(organizationId);

  const typingContext =
    activeTarget?.type === 'room' ? ('room' as const) : ('dm' as const);
  const { handleInputChange: handleTyping } = useTypingIndicator(
    typingContext,
    contextId
  );

  const messages = activeTarget?.type === 'room' ? roomMessages : dmMessages;
  const messagesLoading =
    activeTarget?.type === 'room' ? roomMsgsLoading : dmMsgsLoading;

  const handleSend = useCallback(
    (content: string) => {
      if (!activeTarget) return;
      const payload =
        activeTarget.type === 'room'
          ? { content, roomId: activeTarget.id }
          : { content, dmThreadId: activeTarget.id };
      sendMutation.mutate(payload);
    },
    [activeTarget, sendMutation]
  );

  const handleDeleteMessage = useCallback(
    (messageId: string) => {
      deleteMutation.mutate(messageId);
    },
    [deleteMutation]
  );

  const handleCreateRoom = useCallback(
    (name: string, description: string) => {
      createRoomMutation.mutate(
        { name, organizationId, description, isPublic: true },
        {
          onSuccess: room => {
            setShowCreateRoom(false);
            setActiveTarget({ type: 'room', id: room.id });
          }
        }
      );
    },
    [organizationId, createRoomMutation]
  );

  // Determine header info
  const getHeaderInfo = () => {
    if (!activeTarget) return null;
    if (activeTarget.type === 'room') {
      const room = rooms.find(r => r.id === activeTarget.id);
      return {
        name: room?.name ?? 'Channel',
        description: room?.description,
        type: 'room' as const
      };
    }
    const dm = dmThreads.find(d => d.id === activeTarget.id);
    if (!dm || !currentUser)
      return { name: 'Direct Message', type: 'dm' as const };
    const other = dm.user1Id === currentUser.id ? dm.user2 : dm.user1;
    return { name: other?.fullName ?? 'Unknown', type: 'dm' as const };
  };

  if (!currentUser) return <GenericLoader />;

  const headerInfo = getHeaderInfo();

  return (
    <div className="flex h-full">
      <ChatSidebar
        rooms={rooms}
        dmThreads={dmThreads}
        currentUserId={currentUser.id}
        activeTarget={activeTarget}
        onSelectRoom={id => setActiveTarget({ type: 'room', id })}
        onSelectDm={id => setActiveTarget({ type: 'dm', id })}
        onCreateRoom={() => setShowCreateRoom(true)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {activeTarget && headerInfo ? (
          <>
            <ChatHeader
              name={headerInfo.name}
              description={headerInfo.description}
              type={headerInfo.type}
            />
            <ChatMessageList
              messages={messages}
              currentUserId={currentUser.id}
              isLoading={messagesLoading}
              onDeleteMessage={handleDeleteMessage}
            />
            <ChatMessageInput
              onSend={handleSend}
              onTyping={handleTyping}
              disabled={sendMutation.isPending}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={<MessageCircle className="size-10 text-zinc-300" />}
              title="Select a conversation"
              description="Choose a channel or direct message to start chatting."
            />
          </div>
        )}
      </div>

      <CreateRoomDialog
        open={showCreateRoom}
        onClose={() => setShowCreateRoom(false)}
        onSubmit={handleCreateRoom}
        isSubmitting={createRoomMutation.isPending}
      />
    </div>
  );
}
