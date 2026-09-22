import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../../db/prisma";
import { config } from "../../config";
import { AuthTokenResponse } from "./auth.types";

const SALT_ROUNDS = 12;

export async function registerUser(
  email: string,
  password: string
): Promise<{ id: string; email: string; role: string }> {
  // Check if email already exists
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw Object.assign(new Error("Email already registered"), { statusCode: 409 });
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: { email, passwordHash },
    select: { id: true, email: true, role: true },
  });

  return user;
}

export async function loginUser(
  email: string,
  password: string
): Promise<AuthTokenResponse> {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    throw Object.assign(new Error("Invalid credentials"), { statusCode: 401 });
  }

  const passwordMatch = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatch) {
    throw Object.assign(new Error("Invalid credentials"), { statusCode: 401 });
  }

  const payload = { userId: user.id, role: user.role };
  const token = jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn as jwt.SignOptions["expiresIn"],
  });

  return {
    token,
    expiresIn: config.jwt.expiresIn,
    role: user.role,
  };
}
