import { useOrganizationQuery } from '@/hooks/queries/organizationQueries';
import { useProjectsQuery } from '@/hooks/queries/projectQueries';
import { useNavigate } from '@tanstack/react-router';
import { EmptyState } from '@/components/atoms/EmptyState';
import { CardGrid } from '@/components/organisms/CardGrid';
import { GenericLoader } from '@/shared/ui/generic-loader';
import { Button } from '@/shared/ui/button';
import { FolderKanban, Plus } from 'lucide-react';
import { ProjectCard } from './ProjectCard';

interface ProjectsPageProps {
  orgId: string;
  children?: React.ReactNode;
}

function ProjectsPage({ orgId, children }: ProjectsPageProps) {
  const { isLoading: orgLoading } = useOrganizationQuery(orgId);
  const { data: projects, isLoading: projectsLoading } =
    useProjectsQuery(orgId);
  const navigate = useNavigate();

  if (orgLoading || projectsLoading) {
    return <GenericLoader />;
  }

  return (
    <div className="flex-1 bg-zinc-50">
      <div className="max-w-5xl mx-auto py-8 px-12">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Projects</h1>
            <p className="text-sm text-zinc-500 mt-1">
              Manage and access your team projects
            </p>
          </div>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5">
            <Plus className="size-4" />
            New Project
          </Button>
        </div>

        {!projects || projects.length === 0 ? (
          <EmptyState
            icon={<FolderKanban className="size-12" />}
            title="No projects yet"
            description="Create your first project to start tracking tasks."
          />
        ) : (
          <CardGrid columns={{ sm: 1, md: 2, lg: 3 }}>
            {projects.map(project => (
              <ProjectCard
                key={project.id}
                project={project}
                onClick={() =>
                  navigate({
                    to: '/orgs/$orgId/projects/$projectId',
                    params: { orgId, projectId: project.id }
                  })
                }
              />
            ))}
          </CardGrid>
        )}

        {children}
      </div>
    </div>
  );
}

export { ProjectsPage };
