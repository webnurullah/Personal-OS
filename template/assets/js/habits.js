/*
  Habits — the 7-day tracker is the only data on this page. Streaks, the summary cards,
  the insights and the last week of the heatmap are all calculated from it.
*/
(() => {
  const { $, $$, today, addDays, daysBetween, fmt, pct, toast, icons, escapeHTML } = POS;

  const DAYS = 7;
  const WEEKS = 20;
  const rows = () => $$('#habit-rows > tr');
  const nameOf = (row) => $('[data-name]', row).textContent;
  const daysOf = (row) => $$('.habit-dot', row).map((b) => b.getAttribute('aria-pressed') === 'true');

  // Streak = days in a row up to today (or up to yesterday while today is not ticked yet).
  // data-prior on each row = how many days the streak ran before the 7 days shown.
  function streakOf(days, prior) {
    let i = days.length - 1;
    if (!days[i]) i--;
    let n = 0;
    while (i >= 0 && days[i]) { n++; i--; }
    return i < 0 ? n + prior : n;
  }

  /* ---------- Day headers and button labels ---------- */
  const headers = [];
  for (let back = DAYS - 1; back >= 0; back--) {
    const date = addDays(today(), -back);
    const isToday = back === 0;
    headers.push(`
      <th class="pb-3 text-center font-medium">
        <span class="block ${isToday ? 'text-blue-600' : ''}">${isToday ? 'Today' : fmt(date, 'weekday')}</span>
        <span class="mt-0.5 inline-grid size-6 place-items-center rounded-full text-[11px] ${isToday ? 'bg-blue-600 text-white' : 'text-slate-400'}">${date.getDate()}</span>
      </th>`);
  }
  $('#day-head').firstElementChild.insertAdjacentHTML('afterend', headers.join(''));

  function labelButtons(row) {
    $$('.habit-dot', row).forEach((button, i) => {
      const back = DAYS - 1 - i;
      const label = `${nameOf(row)} · ${back === 0 ? 'Today' : fmt(addDays(today(), -back), 'long')}`;
      button.title = label;
      button.setAttribute('aria-label', label);
      button.classList.toggle('is-today', back === 0);
    });
  }

  /* ---------- Heatmap ---------- */
  // Older days use steady made-up values (same result every time for the same date).
  function sampleValue(date) {
    const x = Math.sin(date.getFullYear() * 372 + date.getMonth() * 31 + date.getDate()) * 10000;
    const r = x - Math.floor(x);
    return r < 0.08 ? 0 : 0.35 + r * 0.65;
  }

  function renderHeatmap(lastWeek) {
    const monday = addDays(today(), -((today().getDay() + 6) % 7));
    const start = addDays(monday, -(WEEKS - 1) * 7);
    let html = '';
    for (let i = 0; i < WEEKS * 7; i++) {
      const date = addDays(start, i);
      const back = daysBetween(date, today());
      if (back < 0) { html += '<span class="aspect-square"></span>'; continue; } // later this week
      const value = back < DAYS ? lastWeek[DAYS - 1 - back] : sampleValue(date);
      const tone = value === 0 ? 'bg-slate-100' : value < 0.5 ? 'bg-emerald-100' : value < 0.8 ? 'bg-emerald-300' : value < 1 ? 'bg-emerald-500' : 'bg-emerald-700';
      html += `<span class="aspect-square rounded-[4px] ${tone} ${back === 0 ? 'ring-2 ring-blue-400 ring-offset-1' : ''}" title="${fmt(date, 'long')}: ${Math.round(value * 100)}% done"></span>`;
    }
    $('#heatmap').innerHTML = html;
  }

  /* ---------- Everything that depends on the tracker ---------- */
  function render() {
    const all = rows();
    if (!all.length) return;
    let best = { days: -1, name: '' };
    let doneToday = 0;
    let doneWeek = 0;
    const perDay = Array(DAYS).fill(0);
    const weekly = [];

    all.forEach((row) => {
      const days = daysOf(row);
      const streak = streakOf(days, Number(row.dataset.prior));
      const done = days.filter(Boolean).length;
      const share = pct(done, DAYS);

      $('[data-streak]', row).textContent = streak;
      $('[data-week-bar]', row).style.width = `${share}%`;
      $('[data-week-pct]', row).textContent = `${share}%`;

      if (days[DAYS - 1]) doneToday++;
      doneWeek += done;
      days.forEach((d, i) => { if (d) perDay[i]++; });
      if (streak > best.days) best = { days: streak, name: nameOf(row) };
      weekly.push({ name: nameOf(row), share });
    });

    $('#sum-today').textContent = `${doneToday} / ${all.length}`;
    $('#sum-streak').textContent = `${best.days} ${best.days === 1 ? 'day' : 'days'}`;
    $('#sum-streak-name').textContent = best.name;
    $('#sum-week').textContent = `${pct(doneWeek, all.length * DAYS)}%`;
    $('#sum-perfect').textContent = `${perDay.filter((count) => count === all.length).length} of ${DAYS}`;

    const ranked = [...weekly].sort((a, b) => b.share - a.share);
    const top = ranked[0];
    const low = ranked[ranked.length - 1];
    $('#insight-best').textContent = `${top.name} · ${top.share}% this week`;
    $('#insight-worst').textContent = `${low.name} · ${low.share}% this week`;

    renderHeatmap(perDay.map((count) => count / all.length));
  }

  $('#habit-rows').addEventListener('click', (e) => {
    const button = e.target.closest('.habit-dot');
    if (!button) return;
    button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true'));
    render();
  });

  /* ---------- New habit ---------- */
  $('#habit-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    const dots = Array.from({ length: DAYS }, () => '<td class="text-center"><button type="button" class="habit-dot habit-dot-lg" aria-pressed="false"></button></td>').join('');
    $('#habit-rows').insertAdjacentHTML(
      'beforeend',
      `<tr class="border-t border-slate-100" data-prior="0">
        <td class="py-3 pr-4"><div class="flex items-center gap-3"><span class="icon-tile bg-blue-50 text-blue-600"><i data-lucide="${escapeHTML(data.get('icon'))}" class="size-4.5"></i></span><div><p class="font-medium text-slate-800" data-name>${escapeHTML(data.get('name').trim())}</p><p class="text-xs text-slate-500">${escapeHTML(data.get('goal').trim() || 'Every day')}</p></div></div></td>
        ${dots}
        <td class="text-center"><span class="inline-flex items-center gap-1 font-semibold text-slate-800"><i data-lucide="flame" class="size-4 text-orange-500"></i><span data-streak>0</span></span></td>
        <td class="pl-4"><div class="flex w-36 items-center gap-2"><div class="progress h-1.5 flex-1"><span class="bg-emerald-500" data-week-bar></span></div><span class="w-9 text-right text-xs font-semibold text-slate-600" data-week-pct></span></div></td>
      </tr>`
    );
    const row = $('#habit-rows').lastElementChild;
    labelButtons(row);
    icons(row);
    render();
    POS.closeModal('habit-modal');
    toast('Habit added. Tick today to start your streak!');
  });

  rows().forEach(labelButtons);
  render();
})();
