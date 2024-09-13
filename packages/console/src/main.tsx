import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import '../../ui/globals.css';
import { ServerViewerPage, loader } from './components/server-viewer.js';
import { ThemeProvider } from '@triplit/ui';
import { ClientProvider } from './components/client-context.js';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
  },
  {
    path: ':serverHost',
    loader: loader,
    element: <ServerViewerPage />,
    // we have to disable revalidation because otherwise it's re-mounting
    // the component and re-running the loader whenever the query params change
    shouldRevalidate: ({ currentUrl, nextUrl }) =>
      currentUrl.pathname !== nextUrl.pathname,
  },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ClientProvider>
        <RouterProvider router={router} />
      </ClientProvider>
    </ThemeProvider>
  </React.StrictMode>
);
