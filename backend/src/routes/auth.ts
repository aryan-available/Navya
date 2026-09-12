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
  password: z.string().min(6, 'Password must be at least 6 characters')
});

const LoginSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(1, 'Password is required')
});

/**
 * POST /auth/register
 * Register a new user account
 */
router.post(
  '/register',
  validateBody(RegisterSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;
      const normalizedEmail = email.trim().toLowerCase();

      const existingUser = await User.findOne({ email: normalizedEmail });
      if (existingUser) {
        throw new ConflictError('A user with this email already exists');
      }

      const passwordHash = await hashPassword(password);
      const user = await User.create({
        email: normalizedEmail,
        passwordHash
      });

      logger.info(`New user registered: ${user.email}`);

      res.status(201).json({
        user: {
          id: user._id.toString(),
          email: user.email,
          role
        }
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /auth/login
 * Authenticate user and issue JWT token
 */
router.post(
  '/login',
  validateBody(LoginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;
      const normalizedEmail = email.trim().toLowerCase();

      const user = await User.findOne({ email: normalizedEmail });
      if (!user) {
        throw new UnauthorizedError('Invalid email or password');
      }

      const isMatch = await user.comparePassword(password);
      const role = user.role || 'operator';
      if (!isMatch) {
        throw new UnauthorizedError('Invalid email or password');
      }

      const token = jwt.sign(
        {
          userId: user._id.toString(),
          email: user.email,
          role
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
          role
        }
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /auth/me
 * Retrieve the current logged-in user (requires JWT)
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
        role: user.role || 'operator'
      }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
