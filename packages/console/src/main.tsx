import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import '../../ui/globals.css';
import { ProjectViewerPage, loader } from './components/project-viewer.js';
import { ThemeProvider } from './components/theme-provider.js';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
  },
  {
    path: ':projectId',
    loader: loader,
    element: <ProjectViewerPage />,
    // we have to disable revalidation because otherwise it's re-mounting
    // the component and re-running the loader whenever the query params change
    shouldRevalidate: ({ currentUrl, nextUrl }) =>
      currentUrl.pathname !== nextUrl.pathname,
  },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  </React.StrictMode>
);
