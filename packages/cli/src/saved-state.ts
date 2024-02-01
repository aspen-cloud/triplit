import Conf from 'conf';

const config = new Conf({ projectName: 'triplit' });

export const storeConfig = (key: string, value: any) => {
  config.set(key, value);
};

export const getConfig = (key: string) => {
  return config.get(key, null) as any | null;
};
