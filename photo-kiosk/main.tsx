import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PhotoKioskApp } from './PhotoKioskApp';
import '../src/styles/tokens.css';
import './photo-kiosk.css';
import { showEnvironmentBanner } from '../src/utils/environmentBanner';

showEnvironmentBanner();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PhotoKioskApp />
  </StrictMode>,
);
