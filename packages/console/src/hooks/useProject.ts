import { useEntity, useQuery } from '@triplit/react';
import { consoleClient } from '../../triplit/client';

export function useProject(projectId: string) {
  const project = useEntity(consoleClient, 'projects', projectId);
  return project;
}

export function useProjects() {
  const { results: projectEntities } = useQuery(
    consoleClient,
    consoleClient.query('projects')
  );
  return projectEntities;
}
