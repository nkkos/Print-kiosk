import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { VerifyEmailPage } from './VerifyEmailPage';
import './portal.css';
import { showEnvironmentBanner } from '../src/utils/environmentBanner';

showEnvironmentBanner();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <VerifyEmailPage />
  </StrictMode>,
);
