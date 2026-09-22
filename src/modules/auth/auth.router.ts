import { Router, Request, Response } from "express";
import { z } from "zod";
import { registerUser, loginUser } from "./auth.service";

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * POST /api/v1/auth/register
 * Register a new user account.
 */
authRouter.post("/register", async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Validation Error",
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const user = await registerUser(parsed.data.email, parsed.data.password);
    res.status(201).json({ message: "User registered successfully", user });
  } catch (err: unknown) {
    const error = err as Error & { statusCode?: number };
    res.status(error.statusCode ?? 500).json({
      error: error.message ?? "Registration failed",
    });
  }
});

/**
 * POST /api/v1/auth/login
 * Authenticate and receive a JWT token.
 */
authRouter.post("/login", async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Validation Error",
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const result = await loginUser(parsed.data.email, parsed.data.password);
    res.status(200).json(result);
  } catch (err: unknown) {
    const error = err as Error & { statusCode?: number };
    res.status(error.statusCode ?? 500).json({
      error: error.message ?? "Login failed",
    });
  }
});
