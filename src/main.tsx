import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { handleAuthCallback } from './services/auth';

handleAuthCallback().then((handled) => {
  if (!handled) createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
}).catch(() => window.close());
