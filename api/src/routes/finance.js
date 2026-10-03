const { Router } = require('express');
const { z, s, parse, nonEmpty } = require('../lib/validate');
const { must, HttpError } = require('../lib/http');
const { todayFor } = require('../lib/profile');
const { monthRange } = require('../lib/dates');
const { fetchAll } = require('../lib/paging');

const router = Router();

const METHODS = /** @type {const} */ (['bKash', 'Nagad', 'Card', 'Cash', 'Bank', 'Other']);

const TxFields = z.object({
  type: z.enum(['income', 'expense']),
  amount: s.money,
  budget_category_id: s.id.nullable().optional(),
  description: s.text(200),
  note: s.optionalText(200).optional(),
  method: z.enum(METHODS),
  tx_date: s.date,
}).strict();

const CategoryFields = z.object({
  name: s.text(40),
  color: s.color.optional(),
  icon: s.icon.optional(),
  monthly_limit: z.number().min(0).max(1e10),
  is_savings: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
}).strict();

const BillFields = z.object({
  name: s.text(120),
  note: s.optionalText(120).optional(),
  amount: s.money,
  budget_category_id: s.id.nullable().optional(),
  icon: s.icon.optional(),
  due_date: s.date,
  repeats_monthly: z.boolean().optional(),
}).strict();

/**
 * Income has no budget category.
 * @template {{ type?: string; budget_category_id?: string | null }} T
 * @param {T} tx
 * @returns {T}
 */
function tidy(tx) {
  if (tx.type === 'income') tx.budget_category_id = null;
  return tx;
}

// One month of money: budget categories, every transaction, and unpaid bills.
// The web app adds up the totals.
router.get('/', async (req, res) => {
  const today = await todayFor(req);
  const { month = today.slice(0, 7) } = parse(z.object({ month: s.month.optional() }), req.query);
  const { first, last } = monthRange(month);
  const [categories, transactions, bills] = await Promise.all([
    req.db.from('budget_categories').select('*').order('position').order('created_at').then(must),
    fetchAll(() => req.db.from('transactions').select('*').gte('tx_date', first).lte('tx_date', last).order('tx_date', { ascending: false }).order('created_at', { ascending: false })),
    req.db.from('bills').select('*').is('paid_at', null).order('due_date').then(must),
  ]);
  res.json({ today, month, categories, transactions, bills });
});

// ---------- Transactions ----------
router.post('/transactions', async (req, res) => {
  const body = tidy(parse(TxFields, req.body));
  res.status(201).json(must(await req.db.from('transactions').insert(body).select().single()));
});

router.patch('/transactions/:id', async (req, res) => {
  const id = parse(s.id, req.params.id);
  const changes = tidy(nonEmpty(parse(TxFields.partial().strict(), req.body)));
  res.json(must(await req.db.from('transactions').update(changes).eq('id', id).select().single()));
});

router.delete('/transactions/:id', async (req, res) => {
  const id = parse(s.id, req.params.id);
  must(await req.db.from('transactions').delete().eq('id', id).select('id').single());
  res.json({ ok: true });
});

// ---------- Budget categories ----------
router.post('/categories', async (req, res) => {
  const body = parse(CategoryFields, req.body);
  if (body.position === undefined) {
    const { count } = await req.db.from('budget_categories').select('id', { count: 'exact', head: true });
    body.position = count ?? 0;
  }
  res.status(201).json(must(await req.db.from('budget_categories').insert(body).select().single()));
});

router.patch('/categories/:id', async (req, res) => {
  const id = parse(s.id, req.params.id);
  const changes = nonEmpty(parse(CategoryFields.partial().strict(), req.body));
  res.json(must(await req.db.from('budget_categories').update(changes).eq('id', id).select().single()));
});

// Transactions in the category keep existing, without a category.
router.delete('/categories/:id', async (req, res) => {
  const id = parse(s.id, req.params.id);
  must(await req.db.from('budget_categories').delete().eq('id', id).select('id').single());
  res.json({ ok: true });
});

// ---------- Bills ----------
router.post('/bills', async (req, res) => {
  const body = parse(BillFields, req.body);
  res.status(201).json(must(await req.db.from('bills').insert(body).select().single()));
});

router.patch('/bills/:id', async (req, res) => {
  const id = parse(s.id, req.params.id);
  const changes = nonEmpty(parse(BillFields.partial().strict(), req.body));
  res.json(must(await req.db.from('bills').update(changes).eq('id', id).is('paid_at', null).select().single()));
});

router.delete('/bills/:id', async (req, res) => {
  const id = parse(s.id, req.params.id);
  must(await req.db.from('bills').delete().eq('id', id).select('id').single());
  res.json({ ok: true });
});

// Pay: adds the expense and marks the bill paid, in one database step.
router.post('/bills/:id/pay', async (req, res) => {
  const id = parse(s.id, req.params.id);
  const { method = 'bKash' } = parse(z.object({ method: z.enum(METHODS).optional() }).strict(), req.body || {});
  const today = await todayFor(req);
  const tx = must(await req.db.rpc('pay_bill', { p_bill_id: id, p_method: method, p_date: today }));
  if (!tx) throw new HttpError(500, 'The bill could not be paid.');
  res.status(201).json(tx);
});

module.exports = router;
