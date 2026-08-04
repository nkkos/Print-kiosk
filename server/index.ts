import express from 'express';
import cors from 'cors';
import { router, DEFAULT_PORT, getLanIPv4 } from './routes.js';

// Dev-only backend for the QR/Email upload methods (docs/qr-upload-requirements.md,
// docs/email-upload-requirements.md). Permissive CORS is intentional here — see
// docs/product-overview.md, "Production-ready backend" and "Security hardening"
// are both out of scope for this milestone. Deployable to Railway as-is: PORT is
// injected there, and CLAMD_HOST/PORT point uploadStore.ts at the `clamav` service.
const app = express();
app.use(cors());
app.use(express.json());
app.use(router);

const port = Number(process.env.PORT ?? DEFAULT_PORT);
app.listen(port, () => {
  console.log(`Upload backend listening on http://localhost:${port}`);
  console.log(`Reachable from phones on the same Wi-Fi at http://${getLanIPv4()}:${port}`);
});
