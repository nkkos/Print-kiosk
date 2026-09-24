import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BusinessApp } from './BusinessApp';
// Reuses the admin console's stylesheet (buttons/inputs/list/modal atoms) —
// this is a functional B2B tool in the same "utilitarian, staff-facing"
// register as the admin panel, not a marketing surface (that's the
// separate landing page), so there's no reason to hand-roll a second
// design system for it.
import '../admin/admin.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BusinessApp />
  </StrictMode>,
);
