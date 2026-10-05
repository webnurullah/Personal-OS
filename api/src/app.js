// The Express app. On Vercel this file is the entry point: Vercel finds src/app.js,
// sees that it uses Express, and runs the exported app as a Vercel Function.
// Locally, src/server.js starts it on a port (npm run dev).
const express = require('express');
const cors = require('cors');
const helmet = require('helmet').default;
const { rateLimit } = require('express-rate-limit');
const config = require('./config');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errors');

const app = express();

// Vercel's proxy sits in front of the app; trust it so rate limits see the real visitor IP.
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet());
app.use(
  cors({
    // Only your web app may call the API from a browser.
    origin: (origin, done) => done(null, !origin || config.corsOrigins.includes(origin)),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    exposedHeaders: ['Content-Disposition'],
    maxAge: 86400,
  }),
);
app.use(express.json({ limit: '200kb' }));
// Counted per running copy of the API (Vercel may run several), so it is a soft limit.
app.use(
  rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 600,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { message: 'Too many requests. Please wait a minute and try again.' } },
  }),
);

const api = express.Router();
// Health check: open this URL in a browser to see that the API is running.
api.get('/', (_req, res) => {
  res.json({ ok: true, name: 'Nurullah POS API', time: new Date().toISOString() });
});
api.use(routes);

app.use(config.basePath || '/', api);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
