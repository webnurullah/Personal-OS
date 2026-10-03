// Settings come from environment variables. On cPanel you can set them in
// "Setup Node.js App", or put them in api/.env (copy .env.example).
const fs = require('node:fs');
const path = require('node:path');

const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

/** @param {string} name */
function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}. Copy api/.env.example to api/.env and fill it in.`);
  }
  return value;
}

module.exports = {
  supabaseUrl: required('SUPABASE_URL'),
  supabaseKey: required('SUPABASE_PUBLISHABLE_KEY'),
  // Websites allowed to call this API, comma separated.
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean),
  // Leave empty when the API has its own subdomain (api.example.com).
  // Set to "/api" if cPanel serves it at example.com/api.
  basePath: (process.env.BASE_PATH || '').replace(/\/$/, ''),
  port: Number(process.env.PORT) || 4000,
  isProduction: process.env.NODE_ENV === 'production',
};
