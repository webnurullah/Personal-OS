/*
  Dashboard — every number at the top is calculated from the lists below it,
  so ticking a task or a habit updates the cards straight away.
*/
(() => {
  const { $, $$, today, addDays, fmt, pct, money, donut, time12, minutesOf, hm, toast } = POS;

  /* ---------- Greeting & date picker ---------- */
  $('#greeting').textContent = `${POS.greeting()}!`;

  let viewDate = today();
  let dateNoteShown = false;
  const isViewingToday = () => +viewDate === +today();

  function renderDate() {
    $('#view-date').textContent = fmt(viewDate, 'full');
    $('#schedule-date').textContent = fmt(viewDate, 'full');
    $('#schedule-title').textContent = isViewingToday() ? "Today's Schedule" : `${fmt(viewDate, 'weekdayLong')}'s Schedule`;
    $('#date-today').disabled = isViewingToday();
  }
  function shiftDate(days) {
    viewDate = days === 0 ? today() : addDays(viewDate, days);
    renderDate();
    renderSchedule();
    if (days !== 0 && !dateNoteShown) {
      dateNoteShown = true;
      toast('Template: every day shows the same sample schedule', { icon: 'info', tone: 'text-blue-600' });
    }
  }
  $('#date-prev').addEventListener('click', () => shiftDate(-1));
  $('#date-next').addEventListener('click', () => shiftDate(1));
  $('#date-today').addEventListener('click', () => shiftDate(0));

  /* ---------- Schedule: highlight what is happening now ---------- */
  function renderSchedule() {
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    let next = null;
    $$('#schedule > li').forEach((li) => {
      const start = minutesOf(li.dataset.start);
      const end = minutesOf(li.dataset.end);
      const current = isViewingToday() && mins >= start && mins < end;
      li.classList.toggle('bg-blue-50', current);
      li.classList.toggle('ring-1', current);
      li.classList.toggle('ring-blue-100', current);
      $('.now-badge', li)?.remove();
      if (current) $('p', li).insertAdjacentHTML('beforeend', ' <span class="now-badge badge ml-1 bg-blue-600 px-1.5 py-0 text-[10px] text-white">Now</span>');
      if (!next && start > mins) next = li;
    });

    const box = $('#next-up');
    if (!isViewingToday()) {
      box.innerHTML = `<b class="font-semibold text-slate-800">${$$('#schedule > li').length} blocks</b> planned for this day`;
    } else if (next) {
      const title = $('p', next).firstChild.textContent.trim();
      const wait = hm((minutesOf(next.dataset.start) - mins) / 60);
      box.innerHTML = `Next: <b class="font-semibold text-slate-800">${title}</b> at ${time12(next.dataset.start)} <span class="text-slate-400">· in ${wait}</span>`;
    } else {
      box.innerHTML = `That's a wrap for today. <b class="font-semibold text-slate-800">Rest well.</b>`;
    }
  }

  /* ---------- Tasks ---------- */
  const taskList = $('#dash-tasks');
  let taskFilter = 'today';

  function renderTasks() {
    const items = $$('li', taskList);
    let shown = 0;
    items.forEach((li) => {
      li.hidden = li.dataset.when !== taskFilter;
      if (!li.hidden) shown++;
    });
    $('#dash-tasks-empty').hidden = shown > 0;

    const todays = items.filter((li) => li.dataset.when === 'today');
    const done = todays.filter((li) => $('input', li).checked).length;
    $('#stat-tasks').textContent = `${done} / ${todays.length}`;
    $('#stat-tasks-bar').style.width = `${pct(done, todays.length)}%`;
    $('#stat-tasks-pct').textContent = `${pct(done, todays.length)}%`;

    const overdue = items.filter((li) => li.dataset.when === 'overdue' && !$('input', li).checked).length;
    $('#overdue-count').textContent = overdue ? `(${overdue})` : '';
  }
  $('#task-tabs').addEventListener('tabchange', (e) => { taskFilter = e.detail; renderTasks(); });
  taskList.addEventListener('change', renderTasks);

  /* ---------- Habits ---------- */
  // Streak = days in a row up to today (or up to yesterday while today is not ticked yet).
  // data-prior on each row = how many days the streak ran before the 5 days shown.
  function streakOf(days, prior) {
    let i = days.length - 1;
    if (!days[i]) i--;
    let n = 0;
    while (i >= 0 && days[i]) { n++; i--; }
    return i < 0 ? n + prior : n;
  }

  const habitRows = $$('#dash-habits > li');
  const habitName = (row) => $('span', row).textContent;

  $('#habit-day-labels').innerHTML = [4, 3, 2, 1, 0]
    .map((back) => `<span class="w-4.5 text-center">${fmt(addDays(today(), -back), 'weekday').charAt(0)}</span>`)
    .join('');

  habitRows.forEach((row) => {
    const dots = $$('.habit-dot', row);
    dots.forEach((dot, i) => {
      const back = dots.length - 1 - i;
      if (back === 0) dot.classList.add('is-today');
      const label = `${habitName(row)} · ${back === 0 ? 'Today' : fmt(addDays(today(), -back), 'long')}`;
      dot.title = label;
      dot.setAttribute('aria-label', label);
    });
  });

  function renderHabits() {
    let best = { days: -1, name: '' };
    let doneToday = 0;
    habitRows.forEach((row) => {
      const days = $$('.habit-dot', row).map((d) => d.getAttribute('aria-pressed') === 'true');
      const streak = streakOf(days, Number(row.dataset.prior));
      $('[data-streak]', row).textContent = `${streak}d`;
      if (days[days.length - 1]) doneToday++;
      if (streak > best.days) best = { days: streak, name: habitName(row) };
    });
    $('#habits-today').textContent = `${doneToday} of ${habitRows.length}`;
    $('#stat-streak').textContent = `${best.days} ${best.days === 1 ? 'day' : 'days'}`;
    $('#stat-streak-habit').textContent = best.name;
  }
  $('#dash-habits').addEventListener('click', (e) => {
    const dot = e.target.closest('.habit-dot');
    if (!dot) return;
    dot.setAttribute('aria-pressed', String(dot.getAttribute('aria-pressed') !== 'true'));
    renderHabits();
  });

  /* ---------- Goals ---------- */
  const goals = $$('#dash-goals > li');
  const onTrack = goals.filter((li) => li.dataset.status === 'on-track').length;
  $('#stat-goals').textContent = `${onTrack} / ${goals.length}`;
  $('#stat-goals-bar').style.width = `${pct(onTrack, goals.length)}%`;
  $('#stat-goals-pct').textContent = `${pct(onTrack, goals.length)}%`;

  /* ---------- Budget ---------- */
  const legend = $('#budget-legend');
  const categories = $$('li', legend);
  const spent = categories.reduce((sum, li) => sum + Number(li.dataset.amount), 0);
  const budget = Number(legend.dataset.budget);

  categories.forEach((li) => { $('[data-pct]', li).textContent = `${pct(Number(li.dataset.amount), spent)}%`; });
  donut($('#budget-donut'), categories.map((li) => ({ value: Number(li.dataset.amount), color: li.dataset.color })), { thickness: 17 });
  $('#budget-spent').textContent = money(spent);
  $('#budget-total').textContent = money(budget);
  $('#budget-left').textContent = budget >= spent ? `${money(budget - spent)} left this month` : `${money(spent - budget)} over budget`;

  const monthSelect = $('#budget-month');
  monthSelect.innerHTML = [0, 1, 2, 3, 4, 5]
    .map((back) => {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - back);
      return `<option>${fmt(d, 'monthShort')}</option>`;
    })
    .join('');
  monthSelect.addEventListener('change', () => toast('Template: every month shows the same sample budget', { icon: 'info', tone: 'text-blue-600' }));

  /* ---------- Notes ---------- */
  let noteId = 100;
  $('#dash-note-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = e.target.elements.note;
    const text = input.value.trim();
    if (!text) return;
    const id = `dn-${noteId++}`;
    $('#dash-notes').insertAdjacentHTML(
      'beforeend',
      `<li class="flex items-start gap-2.5"><input id="${id}" type="checkbox" class="checkbox peer mt-0.5"><label for="${id}" class="text-sm text-slate-700 peer-checked:text-slate-400 peer-checked:line-through">${POS.escapeHTML(text)}</label></li>`
    );
    input.value = '';
    toast('Note added');
  });

  /* ---------- Productivity ---------- */
  const bars = $('#prod-bars');
  const cols = $$(':scope > div', bars);
  const maxHours = Number(bars.dataset.max);
  let thisWeek = 0;
  cols.forEach((col, i) => {
    const hours = Number(col.dataset.hours);
    const back = cols.length - 1 - i;
    const date = addDays(today(), -back);
    const bar = $('span', col);
    thisWeek += hours;
    bar.style.height = `${Math.min(hours / maxHours, 1) * 100}%`;
    bar.title = `${fmt(date, 'long')}: ${hm(hours)} focused`;
    if (back === 0) bar.classList.replace('bg-blue-400', 'bg-blue-600');
    $(':scope > span', col).textContent = back === 0 ? 'Today' : fmt(date, 'weekday');
  });
  const lastWeek = Number(bars.dataset.lastWeek);
  const change = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
  $('#prod-compare').textContent = change >= 0
    ? `You're ${change}% more productive than last week!`
    : `${Math.abs(change)}% less focus time than last week. You've got this.`;

  /* ---------- First paint ---------- */
  renderDate();
  renderSchedule();
  renderTasks();
  renderHabits();
  setInterval(renderSchedule, 60 * 1000);
})();
