import { Link, useParams } from '@tanstack/react-router';
import { Avatar } from '@/components/atoms/Avatar';
import { useKeycloak } from '@/shared/hooks/useKeycloak';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/shared/ui/dropdown-menu';
import {
  LogOut,
  LayoutDashboard,
  Settings,
  ChevronRight,
  MessageCircle
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { User } from '@/api/types';

interface HeaderProps {
  user: User;
  breadcrumb?: { orgName?: string; projectName?: string };
}

export function Header({ user, breadcrumb }: HeaderProps) {
  const { isAuthenticated, logout } = useKeycloak();
  const params = useParams({ strict: false }) as { orgId?: string };

  const handleLogout = async () => {
    await logout();
  };

  const userNameFallback = user?.fullName
    ? user.fullName
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

  return (
    <div className="flex justify-between items-center h-14 px-6 bg-white border-b border-zinc-200">
      <div className="flex items-center gap-4">
        <Link
          to="/"
          data-testid="home-link"
          className="flex items-center gap-3"
        >
          <LayoutDashboard className="size-6 text-blue-600" />
          <span className="text-lg font-bold text-zinc-900">Gira</span>
        </Link>
        {breadcrumb?.orgName && (
          <>
            <div className="w-px h-6 bg-zinc-200" />
            <span
              className={cn(
                'text-sm',
                breadcrumb.projectName
                  ? 'text-zinc-500'
                  : 'text-zinc-900 font-semibold'
              )}
            >
              {breadcrumb.orgName}
            </span>
            {breadcrumb.projectName && (
              <>
                <ChevronRight className="size-4 text-zinc-400" />
                <span className="text-sm font-semibold text-zinc-900">
                  {breadcrumb.projectName}
                </span>
              </>
            )}
          </>
        )}
      </div>

      {isAuthenticated && user && (
        <div className="flex items-center gap-3">
          {params.orgId && (
            <Link
              to="/orgs/$orgId/chat"
              params={{ orgId: params.orgId }}
              data-testid="chat-link"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-zinc-600 hover:text-blue-600 hover:bg-zinc-50 rounded-lg transition-colors"
            >
              <MessageCircle className="size-4" />
              Chat
            </Link>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-full focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2">
                <Avatar
                  src={user.profilePictureUrl}
                  alt={user.fullName}
                  fallback={userNameFallback}
                  className="size-8"
                />
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align="end"
              className="bg-white border border-zinc-200 shadow-lg mt-2 w-56 rounded-lg"
            >
              <div className="px-4 py-3 border-b border-zinc-100">
                <p className="text-sm font-medium text-zinc-900 truncate">
                  {user.fullName}
                </p>
                <p className="text-xs text-zinc-500 truncate">{user.email}</p>
              </div>

              <div className="py-1">
                <DropdownMenuItem asChild>
                  <Link
                    to="/orgs"
                    className="flex items-center gap-3 cursor-pointer px-4 py-2"
                  >
                    <Settings className="size-4 text-zinc-500" />
                    <span className="text-sm text-zinc-700">Organizations</span>
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuItem
                  data-testid="logout-button"
                  onClick={handleLogout}
                  className="flex items-center gap-3 cursor-pointer px-4 py-2"
                >
                  <LogOut className="size-4 text-zinc-500" />
                  <span className="text-sm text-zinc-700">Logout</span>
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
