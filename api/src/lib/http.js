/** An error with an HTTP status code; the error handler turns it into JSON. */
class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   * @param {unknown} [details]
   */
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// Postgres / PostgREST error codes → friendly HTTP errors.
/** @type {Record<string, [number, string]>} */
const KNOWN = {
  23505: [409, 'That already exists.'],
  23503: [400, 'This refers to something that does not exist.'],
  23514: [400, 'Some values are not allowed.'],
  '22P02': [400, 'Some values are not valid.'],
  '22007': [400, 'That date is not valid.'],
  '22008': [400, 'That date is not valid.'],
  42501: [403, 'You are not allowed to do that.'],
  PGRST116: [404, 'Not found.'],
};

/** @param {{ code?: string; message: string; details?: string | null }} error */
function dbError(error) {
  // RAISE EXCEPTION in our SQL functions: the message is written for people.
  if (error.code === 'P0001') return new HttpError(400, error.message);
  const known = error.code ? KNOWN[error.code] : undefined;
  if (known) return new HttpError(known[0], known[1], error.message);
  return new HttpError(500, 'Something went wrong with the database.', error.message);
}

/**
 * Unwraps a Supabase result: returns the data, or throws a friendly error.
 * @template T
 * @param {{ data: T; error: { code?: string; message: string } | null }} result
 * @returns {NonNullable<T>}
 */
function must(result) {
  if (result.error) throw dbError(result.error);
  return /** @type {NonNullable<T>} */ (result.data);
}

module.exports = { HttpError, dbError, must };
