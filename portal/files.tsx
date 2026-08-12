import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FilesPage } from './FilesPage';
import './portal.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FilesPage />
  </StrictMode>,
);
