import { atom, useAtom } from 'jotai';

export const selectedProjectIdAtom = atom<string | undefined>(undefined);

export const useProjectState = () => useAtom(selectedProjectIdAtom);
