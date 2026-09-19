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
    // paymentPinHash is `select: false`, so it has to be asked for explicitly.
    // Every payment route needs to compare against it, and loading it here is
    // cheaper than a second query per payment. It is never serialised: the
    // client only ever sees the `paymentPinSet` flag.
    const user = await User.findById(payload.sub).select("+paymentPinHash");
    if (!user) {
      return res.status(401).json({ error: { code: "UNAUTHENTICATED" } });
    }
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ error: { code: "UNAUTHENTICATED" } });
  }
}
