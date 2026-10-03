const { z } = require('zod');
const { HttpError } = require('./http');

// Building blocks shared by the route schemas.
const s = {
  id: z.guid(),
  date: z.iso.date(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM'),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Use HH:MM'),
  color: z.enum(['white', 'slate', 'blue', 'sky', 'cyan', 'teal', 'emerald', 'lime', 'yellow', 'amber', 'orange', 'rose', 'pink', 'violet', 'indigo']),
  icon: z.string().regex(/^[a-z0-9-]{1,40}$/, 'Use a Lucide icon name'),
  /** @param {number} max */
  text: (max) => z.string().trim().min(1, 'Required').max(max),
  /** @param {number} max */
  optionalText: (max) => z.string().trim().max(max),
  money: z.number().positive().max(1e10),
};

/**
 * Checks input against a schema; throws a 400 with the field errors if it does not fit.
 * @template {z.ZodType} S
 * @param {S} schema
 * @param {unknown} input
 * @returns {z.infer<S>}
 */
function parse(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success) throw new HttpError(400, 'Please check the values you sent.', z.flattenError(result.error));
  return result.data;
}

/**
 * For PATCH: refuses an empty body.
 * @template {Record<string, unknown>} T
 * @param {T} changes
 * @returns {T}
 */
function nonEmpty(changes) {
  if (!Object.keys(changes).length) throw new HttpError(400, 'Nothing to change.');
  return changes;
}

module.exports = { z, s, parse, nonEmpty };
