import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

export const validateRequest = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error } = schema.validate(req.body);
    
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details[0].message,
      });
    }
    
    next();
  };
};

// Validation schemas
export const schemas = {
  register: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
  }),

  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
  }),

  createAnalysis: Joi.object({
    type: Joi.string().valid(
      'BASIC_OVERVIEW',
      'TECHNICAL_ANALYSIS', 
      'FUNDAMENTAL_ANALYSIS',
      'PORTFOLIO_REVIEW',
      'MARKET_SENTIMENT',
      'DEFI_OPPORTUNITIES'
    ).required(),
    parameters: Joi.object({
      symbol: Joi.string().required(),
      timeframe: Joi.string().optional(),
      riskTolerance: Joi.string().valid('low', 'medium', 'high').optional(),
      amount: Joi.number().optional(),
      holdings: Joi.string().optional(),
      chains: Joi.string().optional(),
      notes: Joi.string().optional(),
    }).required(),
  }),
};