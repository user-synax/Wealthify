import { AUTH_COOKIE_NAME } from "../config.js";
import { verifyToken } from "../utils/jwt.js";
import { User } from "../models/User.js";

export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[AUTH_COOKIE_NAME];
    if (!token) {
      return res.status(401).json({ error: { code: "UNAUTHENTICATED" } });
    }
    const payload = verifyToken(token);
    const user = await User.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: { code: "UNAUTHENTICATED" } });
    }
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ error: { code: "UNAUTHENTICATED" } });
  }
}
