const { HttpError } = require('../lib/http');
const config = require('../config');

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} _res
 * @param {import('express').NextFunction} next
 */
function notFound(req, _res, next) {
  next(new HttpError(404, `No such endpoint: ${req.method} ${req.path}`));
}

/**
 * Every error leaves the API as { error: { message, details? } }.
 * Express knows this is the error handler because it takes four arguments.
 * @param {any} err
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
function errorHandler(err, _req, res, _next) {
  // Broken JSON in the request body.
  if (err?.type === 'entity.parse.failed') err = new HttpError(400, 'The request body is not valid JSON.');
  if (err?.type === 'entity.too.large') err = new HttpError(413, 'The request is too large.');

  const status = err instanceof HttpError ? err.status : 500;
  if (status >= 500) console.error(err);

  /** @type {{ message: string; details?: unknown }} */
  const body = { message: status >= 500 && !(err instanceof HttpError) ? 'Something went wrong. Please try again.' : err.message };
  // Field errors are always useful; raw server details only outside production.
  if (err instanceof HttpError && err.details !== undefined && (status < 500 || !config.isProduction)) body.details = err.details;
  res.status(status).json({ error: body });
}

module.exports = { notFound, errorHandler };
