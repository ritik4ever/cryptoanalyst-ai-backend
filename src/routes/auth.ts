import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { config } from '../utils/config.js';
import { validateRequest, schemas } from '../middleware/validation.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();
const prisma = new PrismaClient();

// Register
router.post('/register', validateRequest(schemas.register), asyncHandler(async (req: any, res: any) => {
  const { email, password } = req.body;

  // Check if user exists
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    return res.status(400).json({ error: 'User already exists' });
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 12);

  // Create user
  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
    },
    select: {
      id: true,
      email: true,
      walletId: true,
      createdAt: true,
    },
  });

  // Generate token
  const token = jwt.sign(
    { userId: user.id },
    config.jwt.secret,
    { expiresIn: '7d' }
  );

  res.status(201).json({
    token,
    user,
  });
}));

// Login
router.post('/login', validateRequest(schemas.login), asyncHandler(async (req: any, res: any) => {
  const { email, password } = req.body;

  // Find user
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Check password
  const isValidPassword = await bcrypt.compare(password, user.password);

  if (!isValidPassword) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Generate token
  const token = jwt.sign(
    { userId: user.id },
    config.jwt.secret,
    { expiresIn: '7d' }
  );

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      walletId: user.walletId,
      createdAt: user.createdAt,
    },
  });
}));

// Get profile
router.get('/profile', authenticate, asyncHandler(async (req: any, res: any) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      email: true,
      walletId: true,
      createdAt: true,
    },
  });

  res.json(user);
}));

export default router;