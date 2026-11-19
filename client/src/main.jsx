/**
 * @module main
 * @description Client-side application bootstrap mounting the root React tree in StrictMode.
 * Adheres strictly to Protocol 11 (clean entry points) and Protocol 71 (JSDoc consistency).
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
