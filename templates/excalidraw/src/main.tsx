import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { PageIdProvider } from './use-query-params.js';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <PageIdProvider>
      <App />
    </PageIdProvider>
  </React.StrictMode>
);
