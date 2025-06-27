import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { validateRequest, schemas } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  createAnalysisRequest,
  processAnalysis,
  getAnalysis,
  getUserAnalyses,
  getAnalysisTypes,
} from '../controllers/analysisController.js';

const router = express.Router();

// Get analysis types and pricing
router.get('/types', getAnalysisTypes);

// Create analysis request
router.post('/', authenticate, validateRequest(schemas.createAnalysis), asyncHandler(createAnalysisRequest));

// Get analysis by ID
router.get('/:analysisId', authenticate, asyncHandler(getAnalysis));

// Process analysis (start generation)
router.post('/:analysisId/process', authenticate, asyncHandler(processAnalysis));

// Get user's analyses
router.get('/user', authenticate, asyncHandler(getUserAnalyses));

export default router;