import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RegisterPage } from './RegisterPage';
import './portal.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RegisterPage />
  </StrictMode>,
);
