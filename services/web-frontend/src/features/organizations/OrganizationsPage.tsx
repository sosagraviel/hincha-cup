import { useOrganizationsQuery } from '@/hooks/queries/organizationQueries';
import { useNavigate } from '@tanstack/react-router';
import { EmptyState } from '@/components/atoms/EmptyState';
import { CardGrid } from '@/components/organisms/CardGrid';
import { GenericLoader } from '@/shared/ui/generic-loader';
import { Building2 } from 'lucide-react';
import { OrgCard } from './OrgCard';

function OrganizationsPage() {
  const { data: orgs, isLoading } = useOrganizationsQuery();
  const navigate = useNavigate();

  if (isLoading) {
    return <GenericLoader />;
  }

  return (
    <div className="flex-1 flex flex-col items-center pt-12 px-6 bg-zinc-50">
      <h1 className="text-[28px] font-bold text-zinc-900">
        Your Organizations
      </h1>
      <p className="text-[15px] text-zinc-500 mt-2">
        Select an organization to continue
      </p>

      {!orgs || orgs.length === 0 ? (
        <div className="mt-12">
          <EmptyState
            icon={<Building2 className="size-12" />}
            title="No organizations yet"
            description="Create your first organization to start managing projects."
          />
        </div>
      ) : (
        <CardGrid columns={{ sm: 1, md: 2, lg: 3 }} className="mt-8">
          {orgs.map(org => (
            <OrgCard
              key={org.id}
              org={org}
              onClick={() =>
                navigate({
                  to: '/orgs/$orgId',
                  params: { orgId: org.id }
                })
              }
            />
          ))}
        </CardGrid>
      )}
    </div>
  );
}

export { OrganizationsPage };
