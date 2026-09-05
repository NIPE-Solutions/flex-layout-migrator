import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app';
import './styles/tokens.css';
import './styles/global.css';

const rootElement = document.querySelector('#root');

if (rootElement === null) {
  throw new Error('Website root element is missing.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
