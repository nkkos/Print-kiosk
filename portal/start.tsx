import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StartPage } from './StartPage';
import './portal.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StartPage />
  </StrictMode>,
);
