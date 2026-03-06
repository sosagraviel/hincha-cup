import { cn } from '@/shared/lib/utils';
import { getEntityColor } from '@/shared/lib/entity-colors';
import { Ticket, Users } from 'lucide-react';
import type { Project } from '@/api/types';

interface ProjectCardProps {
  project: Project;
  onClick?: (project: Project) => void;
  className?: string;
}

function ProjectCard({ project, onClick, className }: ProjectCardProps) {
  const color = getEntityColor(project.key);

  return (
    <div
      data-testid={`project-card-${project.id}`}
      className={cn(
        'bg-white rounded-xl border-[1.5px] border-zinc-200 p-5',
        'hover:border-zinc-300 transition-colors cursor-pointer',
        'flex flex-col gap-3.5',
        className
      )}
      onClick={() => onClick?.(project)}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex items-center justify-center size-10 rounded-lg',
            color.bg
          )}
        >
          <span className={cn('text-[11px] font-bold', color.text)}>
            {project.key}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-semibold text-zinc-900 truncate">
            {project.name}
          </h3>
          <p className="text-xs text-zinc-400">{project.key}</p>
        </div>
      </div>

      {project.description && (
        <p className="text-[13px] text-zinc-500 leading-relaxed line-clamp-2">
          {project.description}
        </p>
      )}

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1 text-zinc-400">
          <Ticket className="size-[13px]" />
          <span className="text-xs">0 tickets</span>
        </div>
        <div className="flex items-center gap-1 text-zinc-400">
          <Users className="size-[13px]" />
          <span className="text-xs">0 members</span>
        </div>
      </div>
    </div>
  );
}

export { ProjectCard };
