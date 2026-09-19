import { Router } from "express";
import { User } from "../models/User.js";
import { Wallet } from "../models/Wallet.js";
import { requireAuth } from "../middleware/auth.js";

export const socialRouter = Router();
socialRouter.use(requireAuth);

function profileJson(user, wallet) {
  const netWorth = wallet
    ? wallet.cashBalance + wallet.savingsBalance + wallet.totalInvested
    : 0;
  return {
    id: String(user._id),
    username: user.username,
    avatar: user.avatar ?? "",
    bio: user.bio ?? "",
    level: user.level,
    xp: user.xp,
    career: user.career,
    streak: user.streak ?? 0,
    bestStreak: user.bestStreak ?? 0,
    netWorth,
    createdAt: user.createdAt,
  };
}

socialRouter.get("/leaderboard", async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 50);
    const rows = await Wallet.aggregate([
      {
        $project: {
          userId: 1,
          netWorth: { $add: ["$cashBalance", "$savingsBalance", "$totalInvested"] },
        },
      },
      { $sort: { netWorth: -1, userId: 1 } },
      { $limit: limit },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $project: {
          _id: 0,
          user: {
            id: { $toString: "$user._id" },
            username: "$user.username",
            avatar: "$user.avatar",
            bio: "$user.bio",
            level: "$user.level",
            xp: "$user.xp",
            career: "$user.career",
            streak: "$user.streak",
            bestStreak: "$user.bestStreak",
            createdAt: "$user.createdAt",
          },
          netWorth: 1,
        },
      },
    ]);

    return res.json({
      category: "net_worth",
      period: "all_time",
      items: rows.map((row, index) => ({ ...row.user, netWorth: row.netWorth, rank: index + 1 })),
    });
  } catch (err) {
    return next(err);
  }
});

socialRouter.get("/profiles/:username", async (req, res, next) => {
  try {
    const user = await User.findOne({ username: req.params.username }).lean();
    if (!user) return res.status(404).json({ error: { code: "NOT_FOUND" } });
    const wallet = await Wallet.findOne({ userId: user._id }).lean();
    return res.json({ profile: profileJson(user, wallet) });
  } catch (err) {
    return next(err);
  }
});