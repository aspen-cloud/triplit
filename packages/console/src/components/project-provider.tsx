import { atom, useAtom } from 'jotai';
import { useNavigate, useParams } from 'react-router-dom';

export const useProjectState = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  return [
    projectId,
    (newProjectId: string) => navigate('/' + newProjectId),
  ] as const;
};
