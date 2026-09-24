/*
  IQA course tracker — the topics table holds the facts: estimated hours, planned week,
  status and actual hours. Every other number on the page is calculated from it,
  so the tiles, charts and totals can never disagree with each other.
*/
(() => {
  const { $, $$, today, addDays, daysBetween, fmt, pct, num, donut, toast, escapeHTML } = POS;

  const COURSE_START = new Date(2026, 8, 14); // Monday of week 1: 14 Sep 2026
  const TARGET = new Date(2026, 11, 31); // target completion: 31 Dec 2026
  const WEEKS = 16;
  const UNIT_COLORS = { 1: '#3b82f6', 2: '#10b981', 3: '#f97316', 4: '#8b5cf6' };
  const targetText = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(TARGET);

  const rows = () => $$('#topics tbody tr');
  const units = () => $$('#topics tbody');
  const estOf = (tr) => Number(tr.dataset.est);
  const actualOf = (tr) => Number($('[data-actual]', tr).value) || 0;
  const statusOf = (tr) => $('[data-status-select]', tr).value;
  const codeOf = (tr) => $('[data-code]', tr).textContent;
  // Work finished on a topic: all of it once completed, otherwise the time spent (up to the estimate).
  const doneOf = (tr) => (statusOf(tr) === 'done' ? estOf(tr) : Math.min(actualOf(tr), estOf(tr)));
  const sum = (list, fn) => list.reduce((total, item) => total + fn(item), 0);
  const currentWeek = () => Math.min(WEEKS, Math.max(1, Math.floor(daysBetween(COURSE_START, today()) / 7) + 1));

  /* ---------- Weekly plan table (built once) ---------- */
  const planned = $('#weeks').dataset.planned.split(',').map(Number);
  const thisWeek = currentWeek();
  for (let w = 1; w <= WEEKS; w++) {
    const now = w === thisWeek;
    const from = addDays(COURSE_START, (w - 1) * 7);
    $('#wk-head').insertAdjacentHTML('beforeend', `<th class="border border-slate-100 px-1 py-2 ${now ? 'bg-blue-600 text-white' : ''}" title="${fmt(from, 'short')} – ${fmt(addDays(from, 6), 'short')}">W${w}</th>`);
    $('#wk-planned').insertAdjacentHTML('beforeend', `<td class="border border-slate-100 px-0.5 py-1 ${now ? 'bg-blue-50' : ''}"><input type="number" min="0" step="0.5" value="${planned[w - 1]}" class="cell-input w-12" data-week-plan aria-label="Planned hours for week ${w}"></td>`);
    $('#wk-actual').insertAdjacentHTML('beforeend', `<td class="border border-slate-100 px-1 py-2 font-medium text-slate-700 ${now ? 'bg-blue-50' : ''}" data-week-actual="${w}">–</td>`);
  }
  $('#wk-head').insertAdjacentHTML('beforeend', '<th class="border border-slate-100 px-2 py-2">Total</th>');
  $('#wk-planned').insertAdjacentHTML('beforeend', '<td id="wk-planned-total" class="border border-slate-100 px-2 py-2 font-bold"></td>');
  $('#wk-actual').insertAdjacentHTML('beforeend', '<td id="wk-actual-total" class="border border-slate-100 px-2 py-2 font-bold"></td>');

  /* ---------- Everything calculated from the table ---------- */
  function render() {
    const all = rows();
    const total = sum(all, estOf);
    const done = sum(all, doneOf);
    const spent = sum(all, actualOf);
    const left = total - done;
    const progress = pct(done, total);

    // Rows and unit labels
    all.forEach((tr) => {
      $('[data-remaining]', tr).textContent = num(estOf(tr) - doneOf(tr));
      $('[data-status-select]', tr).dataset.status = statusOf(tr);
    });
    units().forEach((tbody) => { $('[data-unit-hours]', tbody).textContent = `(${num(sum($$('tr', tbody), estOf))} hours)`; });

    // Totals row and key numbers
    $('#sum-est').textContent = num(total);
    $('#sum-actual').textContent = num(spent);
    $('#sum-left').textContent = num(left);
    $('#t-total').textContent = num(total);
    $('#t-done').textContent = num(done);
    $('#t-done-pct').textContent = `${progress}%`;
    $('#t-left').textContent = num(left);
    $('#t-left-pct').textContent = `${100 - progress}%`;

    // Ring: finished work, what is left of in-progress topics, and topics not started
    const leftWhere = (status) => sum(all.filter((tr) => statusOf(tr) === status), (tr) => estOf(tr) - doneOf(tr));
    donut($('#course-donut'), [
      { value: done, color: '#059669' },
      { value: leftWhere('in-progress'), color: '#3b82f6' },
      { value: leftWhere('not-started'), color: '#cbd5e1' },
    ], { thickness: 20 });
    $('#donut-pct').textContent = `${progress}%`;

    // Module progress
    $('#module-list').innerHTML = units()
      .map((tbody) => {
        const unitRows = $$('tr', tbody);
        const share = pct(sum(unitRows, doneOf), sum(unitRows, estOf));
        return `
        <li class="grid grid-cols-[3.5rem_1fr_2.75rem] items-center gap-3">
          <span class="font-medium text-slate-700">Unit ${tbody.dataset.unit}</span>
          <div class="h-5 overflow-hidden rounded bg-slate-100"><span class="block h-full rounded transition-all" style="width:${share}%;background:${UNIT_COLORS[tbody.dataset.unit]}"></span></div>
          <span class="text-right font-semibold text-slate-700">${share}%</span>
        </li>`;
      })
      .join('');

    // This week's topics
    $('#week-label').textContent = `(Week ${thisWeek})`;
    const plan = $('#week-plan');
    $$('[data-topic-item]', plan).forEach((li) => li.remove());
    const weekTopics = all.filter((tr) => Number(tr.dataset.week) === thisWeek);
    plan.insertAdjacentHTML(
      'afterbegin',
      weekTopics
        .map((tr) => {
          const id = `wk-${codeOf(tr).replace('.', '-')}`;
          return `
          <li class="flex items-center gap-2.5" data-topic-item data-code="${codeOf(tr)}">
            <input id="${id}" type="checkbox" class="checkbox checkbox-green peer"${statusOf(tr) === 'done' ? ' checked' : ''}>
            <label for="${id}" class="text-slate-700 peer-checked:text-slate-400 peer-checked:line-through">Unit ${codeOf(tr)} – ${escapeHTML(tr.dataset.short)}</label>
          </li>`;
        })
        .join('') || '<li data-topic-item class="text-slate-500">No topics planned this week. Use it to revise.</li>'
    );

    // Weekly plan: actual hours per planned week, and totals
    const perWeek = Array(WEEKS + 1).fill(0);
    all.forEach((tr) => { perWeek[Number(tr.dataset.week)] += actualOf(tr); });
    for (let w = 1; w <= WEEKS; w++) $(`[data-week-actual="${w}"]`).textContent = perWeek[w] ? num(perWeek[w]) : '–';
    const plannedTotal = sum($$('[data-week-plan]'), (input) => Number(input.value) || 0);
    $('#wk-planned-total').textContent = num(plannedTotal);
    $('#wk-actual-total').textContent = num(spent);
    const spare = plannedTotal - total;
    const note = $('#plan-note');
    note.textContent = spare >= 0
      ? `${num(plannedTotal)}h planned for ${num(total)}h of topics: ${num(spare)}h spare for revision.`
      : `${num(plannedTotal)}h planned, but the topics need ${num(total)}h. Plan ${num(-spare)}h more.`;
    note.classList.toggle('text-amber-600', spare < 0);

    // Overall progress and the pace you need
    $('#overall-bar').style.width = `${progress}%`;
    $('#overall-pct').textContent = `${progress}%`;
    const daysLeft = daysBetween(today(), TARGET);
    $('#t-target').textContent = targetText;
    $('#t-weeks').textContent = daysLeft >= 0 ? `${Math.ceil(daysLeft / 7)} weeks left` : 'target date passed';
    $('#pace').textContent = left <= 0 ? 'Every topic is done. Congratulations!'
      : daysLeft > 0 ? `About ${num(left / (daysLeft / 7))}h a week gets you there by ${targetText}.`
      : `${num(left)}h still to go.`;
  }

  /* ---------- Interactions ---------- */
  $('#topics').addEventListener('input', render); // typing actual hours
  $('#topics').addEventListener('change', (e) => {
    if (e.target.matches('[data-status-select]')) toast(`Topic ${codeOf(e.target.closest('tr'))}: ${e.target.selectedOptions[0].text}`);
    render();
  });
  $('#weeks').addEventListener('input', render);

  // Ticking a topic in "This Week's Plan" marks it completed in the table.
  $('#week-plan').addEventListener('change', (e) => {
    const item = e.target.closest('[data-topic-item]');
    if (!item) return;
    const tr = rows().find((row) => codeOf(row) === item.dataset.code);
    $('[data-status-select]', tr).value = e.target.checked ? 'done' : actualOf(tr) > 0 ? 'in-progress' : 'not-started';
    render();
    toast(e.target.checked ? `Topic ${item.dataset.code} completed. Well done!` : `Topic ${item.dataset.code} reopened`);
  });

  render();
})();
