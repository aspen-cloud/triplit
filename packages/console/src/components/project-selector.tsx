import { Button } from '@triplit/ui';
import { DownloadSimple } from '@phosphor-icons/react';
import { useMemo } from 'react';
import { useProjectState } from './project-provider';
import { useProjects } from '../hooks/useProject';

export function ProjectSelector({
  onPressImportProject,
  onSelectProject,
}: {
  onPressImportProject: () => void;
  onSelectProject: (projectId: string) => void;
}) {
  const [currentProjectId] = useProjectState();
  const projectEntities = useProjects();

  const projectList = useMemo(
    () =>
      projectEntities
        ? Array.from(projectEntities).map(([id, data]) => ({
            id,
            ...data,
          }))
        : [],
    [projectEntities]
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="self-center text-zinc-500 text-sm">Open a project</div>
      {projectList.map(({ id, displayName, server }) => (
        <Button
          key={id}
          style={{ height: 50 }}
          onClick={() => onSelectProject(id)}
          variant={
            currentProjectId && currentProjectId === id ? 'default' : 'ghost'
          }
          className="flex flex-row"
        >
          <div>{displayName}</div>
          <div className="text-xs ml-3 font-normal">{server}</div>
        </Button>
      ))}
      <div className="self-center text-zinc-500 text-sm">or</div>
      <Button variant={'ghost'} onClick={onPressImportProject}>
        <DownloadSimple size={18} />
        <div className="ml-2">Import a new project</div>
      </Button>
    </div>
  );
}
