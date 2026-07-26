import { Router } from 'express';
import whatsappRoutes from './whatsapp.routes';
import healthRoutes from './health.routes';

const router = Router();

// Mount routes under /api/v1
router.use('/whatsapp', whatsappRoutes);
router.use('/health', healthRoutes);

export default router;
