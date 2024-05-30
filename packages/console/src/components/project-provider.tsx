import { atom, useAtom } from 'jotai';
import { useNavigate, useParams } from 'react-router-dom';
import { DEFAULT_HOSTNAME } from 'src/utils/project.js';

export const useProjectState = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  return [
    projectId === 'local' ? DEFAULT_HOSTNAME : projectId,
    (newProjectId: string) => navigate('/' + newProjectId),
  ] as const;
};
