import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AccountPage } from './AccountPage';
import './portal.css';
import { showEnvironmentBanner } from '../src/utils/environmentBanner';

showEnvironmentBanner();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AccountPage />
  </StrictMode>,
);
