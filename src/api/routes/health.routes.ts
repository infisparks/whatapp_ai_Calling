import { Router } from 'express';
import { healthController } from '../controllers/health.controller';

const router = Router();

/**
 * @route   GET /api/v1/health
 * @desc    Health check endpoint
 */
router.get('/', (req, res) => healthController.getHealth(req, res));

export default router;
