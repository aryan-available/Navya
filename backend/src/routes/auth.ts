import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { User, hashPassword } from '../models/User';
import { env } from '../config/env';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { ConflictError, UnauthorizedError, NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';

const router = Router();

const RegisterSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['operator', 'admin']).optional().default('operator')
});

const LoginSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(1, 'Password is required')
});

/**
 * POST /auth/register
 */
router.post(
  '/register',
  validateBody(RegisterSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password, role } = req.body;

      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        throw new ConflictError('A user with this email already exists');
      }

      const passwordHash = await hashPassword(password);
      const user = await User.create({
        email: email.toLowerCase(),
        passwordHash,
        role: role || 'operator'
      });

      logger.info(`New user registered: ${user.email} (Role: ${user.role})`);

      res.status(201).json({
        user: {
          id: user._id.toString(),
          email: user.email,
          role: user.role,
          created_at: user.createdAt
        }
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /auth/login
 */
router.post(
  '/login',
  validateBody(LoginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;

      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        throw new UnauthorizedError('Invalid email or password');
      }

      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        throw new UnauthorizedError('Invalid email or password');
      }

      const token = jwt.sign(
        {
          userId: user._id.toString(),
          email: user.email,
          role: user.role
        },
        env.JWT_SECRET,
        { expiresIn: env.JWT_EXPIRES_IN as any }
      );

      logger.info(`User authenticated: ${user.email}`);

      res.status(200).json({
        token,
        user: {
          id: user._id.toString(),
          email: user.email,
          role: user.role
        }
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /auth/me
 */
router.get('/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await User.findById(req.user?.userId);
    if (!user) {
      throw new NotFoundError('User profile not found');
    }

    res.status(200).json({
      user: {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        created_at: user.createdAt
      }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
