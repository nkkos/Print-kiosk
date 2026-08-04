import express from 'express';
import cors from 'cors';
import { router, PORT, getLanIPv4 } from './routes.js';

// Dev-only backend for the QR upload method (docs/qr-upload-requirements.md).
// Permissive CORS is intentional here — this never leaves a developer's own
// machine (see docs/product-overview.md, "Production-ready backend" and
// "Security hardening" are both out of scope for this milestone).
const app = express();
app.use(cors());
app.use(express.json());
app.use(router);

app.listen(PORT, () => {
  console.log(`QR upload backend listening on http://localhost:${PORT}`);
  console.log(`Reachable from phones on the same Wi-Fi at http://${getLanIPv4()}:${PORT}`);
});
