import { Request, Response, NextFunction } from "express";
import { JwtPayload } from "./auth";

type Role = "USER" | "ADMIN";

const ROLE_HIERARCHY: Record<Role, number> = {
  USER: 1,
  ADMIN: 2,
};

/**
 * RBAC Middleware factory.
 * Usage: router.post('/admin-only', auth, rbac('ADMIN'), handler)
 *
 * ADMIN has access to all USER endpoints (hierarchy-based check).
 */
export function rbac(requiredRole: Role) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user as JwtPayload | undefined;

    if (!user) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Authentication required before authorization check",
      });
      return;
    }

    const userLevel = ROLE_HIERARCHY[user.role] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[requiredRole] ?? 99;

    if (userLevel < requiredLevel) {
      res.status(403).json({
        error: "Forbidden",
        message: `This endpoint requires the '${requiredRole}' role. Your role: '${user.role}'`,
      });
      return;
    }

    next();
  };
}
