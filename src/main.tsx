import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/700.css';
import './index.css';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useGame } from './store/gameStore';
import { controller } from './store/controller';
import { stepYear } from './simulation/engine';
import { checkInvariants } from './simulation/invariants';

// Opt-in handle for automated testing and curious players: add ?debug to the URL.
if (import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug')) {
  (window as unknown as Record<string, unknown>).genesis = { useGame, controller, stepYear, checkInvariants };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
