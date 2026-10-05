const { must } = require('./http');
const { todayIn } = require('./dates');

// Most requests need the user's time zone, so profiles are kept in memory briefly.
// Short, because Vercel may run several copies of the API and each has its own memory.
const TTL_MS = 30 * 1000;
/** @type {Map<string, { profile: import('../types/database').Database['public']['Tables']['profiles']['Row']; at: number }>} */
const cache = new Map();

/**
 * The signed-in user's profile. Creates it (with default categories) if missing.
 * @param {import('express').Request} req
 */
async function getProfile(req) {
  if (req.profile) return req.profile;
  const hit = cache.get(req.user.id);
  if (hit && Date.now() - hit.at < TTL_MS) return (req.profile = hit.profile);
  const profile = must(await req.db.rpc('ensure_profile'));
  cache.set(req.user.id, { profile, at: Date.now() });
  return (req.profile = profile);
}

/** Call after changing a profile. @param {string} userId */
function forgetProfile(userId) {
  cache.delete(userId);
}

/** Today's date in the user's time zone. @param {import('express').Request} req */
async function todayFor(req) {
  return todayIn((await getProfile(req)).timezone);
}

module.exports = { getProfile, forgetProfile, todayFor };
