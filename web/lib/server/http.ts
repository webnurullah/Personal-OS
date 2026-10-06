// Errors that leave the API as JSON: { error: { message, details? } }.

/** An error with an HTTP status code. */
export class HttpError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

type DbFailure = { code?: string; message: string };

// Postgres / PostgREST error codes → friendly HTTP errors.
const KNOWN: Record<string, [number, string]> = {
  "23505": [409, "That already exists."],
  "23503": [400, "This refers to something that does not exist."],
  "23514": [400, "Some values are not allowed."],
  "22P02": [400, "Some values are not valid."],
  "22007": [400, "That date is not valid."],
  "22008": [400, "That date is not valid."],
  "42501": [403, "You are not allowed to do that."],
  PGRST116: [404, "Not found."],
  // RAISE … USING ERRCODE = 'P0002' in the Archive functions: nothing with that id.
  P0002: [404, "Not found."],
};

export function dbError(error: DbFailure) {
  // RAISE EXCEPTION in our SQL functions: the message is written for people.
  if (error.code === "P0001") return new HttpError(400, error.message);
  const known = error.code ? KNOWN[error.code] : undefined;
  if (known) return new HttpError(known[0], known[1], error.message);
  return new HttpError(500, "Something went wrong with the database.", error.message);
}

/** Unwraps a Supabase result: returns the data, or throws a friendly error. */
export function must<T>(result: { data: T; error: DbFailure | null }): NonNullable<T> {
  if (result.error) throw dbError(result.error);
  return result.data as NonNullable<T>;
}

/** The JSON answer for any error. Raw server details are only shown outside production. */
export function errorResponse(error: unknown) {
  const known = error instanceof HttpError;
  const status = known ? error.status : 500;
  if (status >= 500) console.error(error);

  const body: { message: string; details?: unknown } = {
    message: known ? error.message : "Something went wrong. Please try again.",
  };
  if (known && error.details !== undefined && (status < 500 || process.env.NODE_ENV !== "production")) body.details = error.details;
  return Response.json({ error: body }, { status });
}
