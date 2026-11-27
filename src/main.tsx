import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthGate } from './ui';
import { AppErrorBoundary } from './AppErrorBoundary';
import './style.css';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`); });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><AppErrorBoundary><AuthGate /></AppErrorBoundary></StrictMode>,
);
