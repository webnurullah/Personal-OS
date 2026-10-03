const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

/** @typedef {import('./types/database').Database} Database */
/** @typedef {import('@supabase/supabase-js').SupabaseClient<Database>} Db */

const noSession = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

// Only used to check sign-in tokens. It keeps Supabase's public signing keys
// in memory, so most checks need no network call.
const authClient = createClient(config.supabaseUrl, config.supabaseKey, { auth: noSession });

/**
 * A client that acts as the signed-in user: Supabase applies Row Level
 * Security to every query, so one user can never touch another's rows.
 * @param {string} token the user's access token
 * @returns {Db}
 */
function clientFor(token) {
  return createClient(config.supabaseUrl, config.supabaseKey, {
    auth: noSession,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

module.exports = { authClient, clientFor };
