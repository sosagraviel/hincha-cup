import { useState } from 'react';
import { Avatar } from '@/components/atoms/Avatar';
import { Input } from '@/shared/ui/input';
import { Button } from '@/shared/ui/button';
import { Send } from 'lucide-react';
import { formatDateAsDateAndTime } from '@/shared/lib/utils';
import type { Comment } from '@/api/types';

interface TicketCommentSectionProps {
  comments: Comment[];
  onAddComment: (content: string) => void;
  isPending?: boolean;
}

function TicketCommentSection({
  comments,
  onAddComment,
  isPending
}: TicketCommentSectionProps) {
  const [newComment, setNewComment] = useState('');

  const handleSubmit = () => {
    if (!newComment.trim()) return;
    onAddComment(newComment.trim());
    setNewComment('');
  };

  return (
    <>
      <div className="space-y-3">
        {comments.map(comment => (
          <div
            key={comment.id}
            className="flex gap-3 p-3 bg-zinc-50 rounded-lg"
          >
            <Avatar
              src={comment.author?.profilePictureUrl}
              alt={comment.author?.fullName}
              size="sm"
              className="flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-zinc-900">
                  {comment.author?.fullName}
                </span>
                <span className="text-xs text-zinc-400">
                  {formatDateAsDateAndTime(comment.createdAt)}
                </span>
              </div>
              <p className="text-sm text-zinc-700">{comment.content}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <Input
          type="text"
          value={newComment}
          onChange={e => setNewComment(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Add a comment..."
          className="flex-1"
        />
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={!newComment.trim() || isPending}
        >
          <Send className="size-4 mr-1.5" />
          Comment
        </Button>
      </div>
    </>
  );
}

export { TicketCommentSection };
