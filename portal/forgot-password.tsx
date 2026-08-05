import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ForgotPasswordPage } from './ForgotPasswordPage';
import './portal.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ForgotPasswordPage />
  </StrictMode>,
);
