import useUrlState from '@ahooksjs/use-url-state';

export function useSelectedCollection() {
  const [state, setState] = useUrlState({
    collectionName: undefined,
  });
  return [
    state.collectionName,
    (collectionName: string) =>
      setState({ collectionName, order: undefined, where: undefined }),
  ];
}
