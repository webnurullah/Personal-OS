const { authClient, clientFor } = require('../supabase');
const { HttpError } = require('../lib/http');

/**
 * Checks the "Authorization: Bearer <token>" header sent by the web app.
 * The token comes from Supabase Auth; getClaims() verifies its signature.
 * @param {import('express').Request} req
 * @param {import('express').Response} _res
 * @param {import('express').NextFunction} next
 */
async function requireUser(req, _res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'Please sign in.');

  const { data, error } = await authClient.auth.getClaims(token);
  const userId = data?.claims?.sub;
  if (error || !userId) throw new HttpError(401, 'Your session has ended. Please sign in again.');

  req.user = { id: userId, email: typeof data.claims.email === 'string' ? data.claims.email : '' };
  req.db = clientFor(token);
  next();
}

module.exports = { requireUser };
