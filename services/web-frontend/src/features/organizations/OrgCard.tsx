import { cn } from '@/shared/lib/utils';
import { getEntityColor } from '@/shared/lib/entity-colors';
import type { Organization } from '@/api/types';

interface OrgCardProps {
  org: Organization;
  onClick?: (org: Organization) => void;
  className?: string;
}

function OrgCard({ org, onClick, className }: OrgCardProps) {
  const color = getEntityColor(org.name);
  const initial = org.name.charAt(0).toUpperCase();

  return (
    <div
      data-testid={`org-card-${org.id}`}
      className={cn(
        'bg-white rounded-xl border-[1.5px] border-zinc-200 p-6',
        'hover:border-zinc-300 transition-colors cursor-pointer',
        'flex flex-col items-center gap-4 w-[250px]',
        className
      )}
      onClick={() => onClick?.(org)}
    >
      <div
        className={cn(
          'flex items-center justify-center size-14 rounded-xl',
          color.bg
        )}
      >
        {org.logoUrl ? (
          <img
            src={org.logoUrl}
            alt={org.name}
            className="size-8 rounded object-cover"
          />
        ) : (
          <span className={cn('text-[22px] font-bold', color.text)}>
            {initial}
          </span>
        )}
      </div>
      <div className="text-center">
        <h3 className="text-base font-semibold text-zinc-900">{org.name}</h3>
        {org.description && (
          <p className="text-[13px] text-zinc-400 mt-1">{org.description}</p>
        )}
      </div>
    </div>
  );
}

export { OrgCard };
