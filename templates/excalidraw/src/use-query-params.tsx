import { useEffect, createContext, useState, useContext } from 'react';

export function useSyncQueryParams(name: string) {
  const valueStateHook = useState<string | null>(getUrlParam(name));
  const [value, setValue] = valueStateHook;
  useEffect(() => {
    if (value) {
      setUrlParam(name, value);
    }
  }, [value, name]);

  useEffect(() => {
    // Update value when browser history changes
    const handler = () => {
      setValue(getUrlParam(name));
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [name]);

  return valueStateHook;
}

function getUrlParam(name: string) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

function setUrlParam(name: string, value: string | any) {
  const url = new URL(window.location.href);
  url.searchParams.set(name, value);
  window.history.pushState({}, '', url.toString());
}

const PageIdContext = createContext<[string | null, (id: string) => void]>([
  null,
  (_id) => {},
]);

export function PageIdProvider({ children }: { children: React.ReactNode }) {
  const value = useSyncQueryParams('pageId');
  return (
    <PageIdContext.Provider value={value}>{children}</PageIdContext.Provider>
  );
}

export function usePageId() {
  const context = PageIdContext;
  if (!context) {
    throw new Error('usePageId must be used within a PageIdProvider');
  }
  return useContext(context);
}
