import Conf from 'conf';
import { randomUUID } from 'node:crypto';

// TODO implement Zod style schema validation
export const CONFIG_KEYS = ['installId', 'telemetryEnabled'];

export const config = new Conf<{
  installId?: string | null;
  telemetryEnabled?: boolean;
}>({
  projectName: 'triplit-cli',
});

export const getTelemetryEnabled = () => {
  return config.get('telemetryEnabled', true);
};

export const setTelemetryEnabled = (enabled: boolean) => {
  return config.set('telemetryEnabled', enabled);
};

export const getInstallId = () => {
  let installId = config.get('installId', null);
  if (!installId) {
    installId = randomUUID();
    config.set('installId', installId);
  }
  return installId;
};
