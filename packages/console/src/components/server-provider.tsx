import { useNavigate, useParams } from 'react-router-dom';
import { DEFAULT_HOST } from 'src/utils/server.js';

export const useServerState = () => {
  const { serverHost } = useParams();
  const navigate = useNavigate();
  return [
    serverHost === 'local' ? DEFAULT_HOST : serverHost ?? '',
    (newHost: string) => navigate('/' + newHost),
  ] as const;
};
