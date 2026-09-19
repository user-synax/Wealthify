"use client";

import { apiRequest } from "./api";

export const fetchLeaderboard = (signal) =>
  apiRequest("/api/social/leaderboard", { signal });

export const fetchPublicProfile = (username, signal) =>
  apiRequest(`/api/social/profiles/${encodeURIComponent(username)}`, { signal });