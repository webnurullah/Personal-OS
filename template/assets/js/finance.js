/*
  Finance — the transactions table is the only money data on this page.
  The summary cards, budget bars and the ring are added up from it,
  so adding a transaction or paying a bill updates everything.
*/
(() => {
  const { $, $$, today, addDays, daysBetween, isoDate, fmt, relativeDay, pct, money, donut, toast, icons, escapeHTML } = POS;

  const CATEGORY = {
    Housing: { color: '#60a5fa', badge: 'bg-blue-50 text-blue-700', icon: 'house' },
    Food: { color: '#a78bfa', badge: 'bg-violet-50 text-violet-700', icon: 'utensils' },
    Transport: { color: '#fb923c', badge: 'bg-orange-50 text-orange-700', icon: 'car' },
    Lifestyle: { color: '#facc15', badge: 'bg-yellow-50 text-yellow-700', icon: 'sparkles' },
    Savings: { color: '#34d399', badge: 'bg-emerald-50 text-emerald-700', icon: 'piggy-bank' },
    Income: { color: '#10b981', badge: 'bg-green-50 text-green-700', icon: 'banknote' },
  };
  const METHOD = {
    bKash: ['smartphone', 'text-pink-500'],
    Nagad: ['smartphone', 'text-orange-500'],
    Card: ['credit-card', 'text-blue-500'],
    Cash: ['banknote', 'text-emerald-600'],
    Bank: ['landmark', 'text-slate-500'],
  };

  const body = $('#tx-body');
  const rows = () => $$('#tx-body > tr');
  const amountOf = (tr) => Number(tr.dataset.amount);
  let filter = 'all';

  // Fill the cells that come from the row's data: icon, date, category badge, payment icon, signed amount.
  function decorate(tr) {
    const cat = CATEGORY[tr.dataset.category];
    const income = tr.dataset.type === 'income';
    if (!tr.dataset.ready) {
      const first = tr.cells[0];
      first.innerHTML = `<div class="flex items-center gap-3"><span class="icon-tile size-9 ${cat.badge}"><i data-lucide="${cat.icon}" class="size-4"></i></span><div class="min-w-0">${first.innerHTML}</div></div>`;
      const method = $('[data-method]', tr);
      const name = method.textContent.trim();
      const [icon, tone] = METHOD[name] || ['wallet', 'text-slate-400'];
      method.innerHTML = `<span class="inline-flex items-center gap-1.5"><i data-lucide="${icon}" class="size-3.5 ${tone}"></i>${escapeHTML(name)}</span>`;
      tr.dataset.ready = 'true';
    }
    $('[data-date]', tr).textContent = relativeDay(addDays(today(), Number(tr.dataset.offset)));
    $('[data-badge]', tr).innerHTML = `<span class="badge ${cat.badge}">${tr.dataset.category}</span>`;
    const cell = $('[data-amount-cell]', tr);
    cell.textContent = `${income ? '+' : '−'}${money(amountOf(tr))}`;
    cell.classList.toggle('text-emerald-600', income);
    cell.classList.toggle('text-slate-900', !income);
  }

  function render() {
    const all = rows();

    // Filter + search
    const query = $('#tx-search').value.trim().toLowerCase();
    let shown = 0;
    all.forEach((tr) => {
      tr.hidden = !((filter === 'all' || tr.dataset.type === filter) && (!query || tr.textContent.toLowerCase().includes(query)));
      if (!tr.hidden) shown++;
    });
    $('#tx-empty').hidden = shown > 0;

    // Totals
    let income = 0;
    const byCategory = {};
    all.forEach((tr) => {
      if (tr.dataset.type === 'income') income += amountOf(tr);
      else byCategory[tr.dataset.category] = (byCategory[tr.dataset.category] || 0) + amountOf(tr);
    });
    const outgoing = Object.values(byCategory).reduce((a, b) => a + b, 0);
    const saved = byCategory.Savings || 0;
    const budgetRows = $$('#budget-list > li');
    const budget = budgetRows.reduce((total, li) => total + Number(li.dataset.budget), 0);

    $('#sum-income').textContent = money(income);
    $('#sum-spent').textContent = money(outgoing - saved);
    $('#sum-saved').textContent = money(saved);
    $('#sum-rate').textContent = `${pct(saved, income)}%`;
    $('#sum-left').textContent = money(budget - outgoing);
    $('#sum-left').classList.toggle('text-rose-600', outgoing > budget);
    $('#sum-budget').textContent = money(budget);

    // Budget bars
    budgetRows.forEach((li) => {
      const name = li.dataset.category;
      const limit = Number(li.dataset.budget);
      const used = byCategory[name] || 0;
      const over = used > limit;
      li.innerHTML = `
        <div class="flex items-center gap-3">
          <span class="icon-tile size-8 ${CATEGORY[name].badge}"><i data-lucide="${CATEGORY[name].icon}" class="size-4"></i></span>
          <div class="min-w-0 flex-1">
            <div class="flex items-baseline justify-between gap-2 text-sm">
              <span class="font-medium text-slate-800">${name}</span>
              <span class="text-xs ${over ? 'font-semibold text-rose-600' : 'text-slate-500'}">${money(used)} / ${money(limit)}</span>
            </div>
            <div class="progress mt-1.5 h-2"><span style="width:${Math.min(pct(used, limit), 100)}%;background:${over ? '#f43f5e' : CATEGORY[name].color}"></span></div>
          </div>
        </div>`;
    });
    icons($('#budget-list'));

    // Ring: each category's share of the budget (the grey part is budget not used yet)
    donut($('#budget-donut'), budgetRows.map((li) => ({ value: byCategory[li.dataset.category] || 0, color: CATEGORY[li.dataset.category].color })), { thickness: 16, max: Math.max(budget, outgoing) });
    $('#donut-used').textContent = `${pct(outgoing, budget)}%`;
    $('#donut-spent').textContent = money(outgoing);
    $('#donut-budget').textContent = money(budget);
  }

  // Newest first
  function insertRow(tr) {
    const offset = Number(tr.dataset.offset);
    const older = rows().find((other) => Number(other.dataset.offset) <= offset);
    body.insertBefore(tr, older || null);
    decorate(tr);
    icons(tr);
    render();
    tr.classList.add('bg-blue-50/60');
    setTimeout(() => tr.classList.remove('bg-blue-50/60'), 1600);
  }

  function newRow({ type, category, amount, offset, desc, note, method }) {
    const tr = document.createElement('tr');
    Object.assign(tr.dataset, { type, category, amount, offset });
    tr.innerHTML = `
      <td class="px-5 py-3"><p class="font-medium text-slate-800">${escapeHTML(desc)}</p><p class="text-xs text-slate-500">${escapeHTML(note)}</p></td>
      <td class="px-4 py-3 text-slate-600" data-date></td>
      <td class="px-4 py-3" data-badge></td>
      <td class="px-4 py-3 text-slate-600" data-method>${escapeHTML(method)}</td>
      <td class="px-5 py-3 text-right font-semibold" data-amount-cell></td>`;
    return tr;
  }

  $('#tx-filter').addEventListener('tabchange', (e) => { filter = e.detail; render(); });
  $('#tx-search').addEventListener('input', render);

  /* ---------- Month picker (sample data is the same for every month) ---------- */
  $('#month').innerHTML = [0, 1, 2, 3, 4, 5]
    .map((back) => {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - back);
      return `<option>${fmt(d, 'month')}</option>`;
    })
    .join('');
  $('#month').addEventListener('change', () => toast('Template: every month shows the same sample data', { icon: 'info', tone: 'text-blue-600' }));

  /* ---------- Pay a bill ---------- */
  $('#bills').addEventListener('click', (e) => {
    const button = e.target.closest('[data-pay]');
    if (!button) return;
    const bill = button.closest('li');
    insertRow(newRow({ type: 'expense', category: bill.dataset.category, amount: bill.dataset.amount, offset: 0, desc: bill.dataset.name, note: bill.dataset.note, method: 'bKash' }));
    bill.remove();
    $('#bills-empty').hidden = $$('#bills > li').length > 0;
    toast(`${bill.dataset.name} paid: ${money(Number(bill.dataset.amount))}`);
  });

  /* ---------- Add a transaction ---------- */
  const form = $('#tx-form');
  const categorySelect = $('#tx-cat');
  $('#tx-date').defaultValue = isoDate(today());
  form.addEventListener('change', (e) => { if (e.target.name === 'type') categorySelect.disabled = e.target.value === 'income'; });
  form.addEventListener('reset', () => { categorySelect.disabled = false; });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const type = data.get('type');
    const [y, m, d] = data.get('date').split('-').map(Number);
    insertRow(newRow({
      type,
      category: type === 'income' ? 'Income' : data.get('category'),
      amount: Math.round(Number(data.get('amount'))),
      offset: daysBetween(today(), new Date(y, m - 1, d)),
      desc: data.get('desc').trim(),
      note: 'Added just now',
      method: data.get('method'),
    }));
    POS.closeModal('tx-modal');
    toast(type === 'income' ? 'Income added' : 'Expense added');
  });

  rows().forEach(decorate);
  render();
})();
