/*
  Calendar — month grid, the selected day's agenda and a "coming up" list.
  Sample events are written as "days from today" (offset), so the calendar always has something to show.
*/
(() => {
  const { $, $$, today, addDays, daysBetween, isoDate, fmt, relativeDay, time12, minutesOf, hm, toast, escapeHTML } = POS;

  const CATEGORY = {
    Work: { chip: 'bg-blue-50 text-blue-700', bar: 'bg-blue-500' },
    Personal: { chip: 'bg-violet-50 text-violet-700', bar: 'bg-violet-500' },
    Health: { chip: 'bg-emerald-50 text-emerald-700', bar: 'bg-emerald-500' },
    Learning: { chip: 'bg-teal-50 text-teal-700', bar: 'bg-teal-500' },
    Finance: { chip: 'bg-amber-50 text-amber-700', bar: 'bg-amber-500' },
  };

  const SAMPLE_EVENTS = [
    // Today — the same blocks as the dashboard's schedule
    { offset: 0, start: '07:00', end: '08:30', title: 'Morning Routine', note: 'Exercise • Shower • Breakfast', cat: 'Personal' },
    { offset: 0, start: '09:00', end: '12:00', title: 'Deep Work', note: 'Work on project proposal', cat: 'Work' },
    { offset: 0, start: '12:00', end: '13:00', title: 'Lunch Break', note: 'Healthy meal & short walk', cat: 'Health' },
    { offset: 0, start: '13:00', end: '13:30', title: 'Team Sync', note: 'Zoom meeting', cat: 'Work' },
    { offset: 0, start: '15:00', end: '16:00', title: 'Personal Finance', note: 'Review expenses', cat: 'Finance' },
    { offset: 0, start: '18:00', end: '19:00', title: 'Gym', note: 'Strength training', cat: 'Health' },
    { offset: 0, start: '20:00', end: '20:30', title: 'Read', note: '30 minutes', cat: 'Personal' },
    { offset: 0, start: '21:30', end: '22:00', title: 'Wind Down', note: 'Journaling • Plan tomorrow', cat: 'Personal' },
    // Before today
    { offset: -10, start: '10:00', end: '16:00', title: 'Team offsite', note: 'Gulshan', cat: 'Work' },
    { offset: -7, start: '19:00', end: '20:00', title: 'IQA course kickoff', note: 'Unit 1 · Week 1', cat: 'Learning' },
    { offset: -5, start: '18:00', end: '19:00', title: 'Gym', note: 'Leg day', cat: 'Health' },
    { offset: -3, start: '20:00', end: '22:30', title: 'Movie night', note: 'With family', cat: 'Personal' },
    { offset: -2, start: '18:00', end: '19:00', title: 'Gym', note: 'Upper body', cat: 'Health' },
    { offset: -1, allDay: true, title: 'Electricity bill due', cat: 'Finance' },
    // After today
    { offset: 2, start: '18:00', end: '19:00', title: 'Gym', note: 'Strength training', cat: 'Health' },
    { offset: 2, start: '19:30', end: '20:30', title: 'Study: practice exercises', note: '1h planned', cat: 'Learning' },
    { offset: 3, start: '10:30', end: '11:15', title: 'Dentist appointment', note: 'Dhanmondi', cat: 'Health' },
    { offset: 3, start: '15:00', end: '16:00', title: 'Team retrospective', note: 'Meeting room B', cat: 'Work' },
    { offset: 4, start: '19:00', end: '21:00', title: 'Study: read chapter 3', note: '2h planned', cat: 'Learning' },
    { offset: 5, start: '19:30', end: '21:30', title: 'Family dinner', note: 'Home', cat: 'Personal' },
    { offset: 6, start: '10:00', end: '13:30', title: 'Study: project practice', note: '3.5h planned', cat: 'Learning' },
    { offset: 7, allDay: true, title: 'Project proposal deadline', cat: 'Work' },
    { offset: 9, start: '15:00', end: '16:00', title: 'Monthly budget review', note: 'Close the month', cat: 'Finance' },
    { offset: 11, allDay: true, title: "Sarah's birthday", cat: 'Personal' },
    { offset: 12, start: '17:00', end: '17:30', title: 'Doctor check-up', note: 'Yearly', cat: 'Health' },
    { offset: 14, allDay: true, title: 'Car insurance renewal', cat: 'Finance' },
    { offset: 18, start: '18:00', end: '23:00', title: "Friend's wedding", note: 'Dhaka', cat: 'Personal' },
    { offset: 21, start: '19:00', end: '20:00', title: 'IQA Unit 2 starts', note: 'Planning IQA', cat: 'Learning' },
  ];

  const events = SAMPLE_EVENTS.map((e) => ({ ...e, date: isoDate(addDays(today(), e.offset)) }));
  const parseKey = (key) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  // All-day events first, then by start time.
  const byTime = (a, b) => (a.allDay === b.allDay ? (a.allDay ? 0 : minutesOf(a.start) - minutesOf(b.start)) : a.allDay ? -1 : 1);
  const eventsOn = (key) => events.filter((e) => e.date === key).sort(byTime);
  // "19:30" → "7:30pm" (short form for the month grid)
  const shortTime = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
  };

  let view = new Date(today().getFullYear(), today().getMonth(), 1); // first day of the month on screen
  let selected = isoDate(today());

  /* ---------- Month grid ---------- */
  function renderMonth() {
    $('#cal-title').textContent = fmt(view, 'month');
    const lead = (view.getDay() + 6) % 7; // grid starts on Monday
    const start = addDays(view, -lead);
    const todayKey = isoDate(today());
    let html = '';

    for (let i = 0; i < 42; i++) {
      const day = addDays(start, i);
      const key = isoDate(day);
      const inMonth = day.getMonth() === view.getMonth();
      const list = eventsOn(key);
      const isSelected = key === selected;
      const chips = list
        .slice(0, 3)
        .map((e) => `<span class="hidden truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium sm:block ${CATEGORY[e.cat].chip}">${e.allDay ? '' : `<span class="opacity-70">${shortTime(e.start)}</span> `}${escapeHTML(e.title)}</span>`)
        .join('');
      const more = list.length > 3 ? `<span class="hidden px-1.5 text-[11px] font-medium text-slate-500 sm:block">+${list.length - 3} more</span>` : '';
      const dots = list.length ? `<span class="flex flex-wrap gap-0.5 sm:hidden">${list.slice(0, 4).map((e) => `<span class="size-1.5 rounded-full ${CATEGORY[e.cat].bar}"></span>`).join('')}</span>` : '';
      const number = key === todayKey ? 'bg-blue-600 text-white' : inMonth ? 'text-slate-700' : 'text-slate-300';

      html += `
        <button type="button" data-date="${key}" aria-pressed="${isSelected}" aria-label="${fmt(day, 'long')}${list.length ? `, ${list.length} events` : ''}"
          class="flex min-h-20 min-w-0 flex-col gap-1 border-b border-r border-slate-100 p-1.5 text-left transition hover:bg-slate-50 sm:min-h-28 sm:p-2 [&:nth-child(7n)]:border-r-0 [&:nth-last-child(-n+7)]:border-b-0 ${isSelected ? 'bg-blue-50/70 ring-2 ring-inset ring-blue-200' : inMonth ? '' : 'bg-slate-50/60'}">
          <span class="grid size-7 shrink-0 place-items-center rounded-full text-sm font-medium ${number}">${day.getDate()}</span>
          ${chips}${more}${dots}
        </button>`;
    }
    $('#cal-grid').innerHTML = html;
  }

  /* ---------- Agenda for the selected day ---------- */
  function renderAgenda() {
    const date = parseKey(selected);
    const diff = daysBetween(today(), date);
    $('#agenda-label').textContent = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday' : diff > 0 ? `In ${diff} days` : `${-diff} days ago`;
    $('#agenda-date').textContent = fmt(date, 'long');

    const list = eventsOn(selected);
    $('#agenda-list').innerHTML = list.length
      ? list
          .map((e) => {
            const length = e.allDay ? 'All day' : hm((minutesOf(e.end) - minutesOf(e.start)) / 60);
            return `
            <li class="grid grid-cols-[4.25rem_auto_1fr] items-start gap-3 rounded-xl px-2 py-2 transition hover:bg-slate-50">
              <span class="pt-0.5 text-xs font-medium text-slate-500">${e.allDay ? 'All day' : time12(e.start)}</span>
              <span class="mt-0.5 h-9 w-1 rounded-full ${CATEGORY[e.cat].bar}"></span>
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold text-slate-800">${escapeHTML(e.title)}</p>
                <p class="truncate text-xs text-slate-500">${e.allDay ? e.cat : length}${e.note ? ` · ${escapeHTML(e.note)}` : ''}</p>
              </div>
            </li>`;
          })
          .join('')
      : `<li class="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">Nothing planned. Enjoy the free time!</li>`;
  }

  /* ---------- Coming up ---------- */
  function renderUpcoming() {
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const todayKey = isoDate(today());
    const next = events
      .filter((e) => e.date > todayKey || (e.date === todayKey && !e.allDay && minutesOf(e.start) > nowMins))
      .sort((a, b) => a.date.localeCompare(b.date) || byTime(a, b))
      .slice(0, 6);

    $('#upcoming-list').innerHTML = next
      .map((e) => {
        const date = parseKey(e.date);
        return `
        <li class="flex items-center gap-3 py-2.5">
          <div class="w-11 shrink-0 rounded-lg bg-slate-50 py-1 text-center ring-1 ring-slate-100">
            <p class="text-[10px] font-semibold uppercase text-slate-500">${fmt(date, 'weekday')}</p>
            <p class="text-base font-bold leading-tight text-slate-900">${date.getDate()}</p>
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-slate-800">${escapeHTML(e.title)}</p>
            <p class="text-xs text-slate-500">${relativeDay(date)} · ${e.allDay ? 'All day' : time12(e.start)}</p>
          </div>
          <span class="size-2 shrink-0 rounded-full ${CATEGORY[e.cat].bar}"></span>
        </li>`;
      })
      .join('');
  }

  function renderAll() {
    renderMonth();
    renderAgenda();
    renderUpcoming();
  }

  /* ---------- Interactions ---------- */
  $('#cal-grid').addEventListener('click', (e) => {
    const cell = e.target.closest('[data-date]');
    if (!cell) return;
    selected = cell.dataset.date;
    const date = parseKey(selected);
    if (date.getMonth() !== view.getMonth()) view = new Date(date.getFullYear(), date.getMonth(), 1);
    renderMonth();
    renderAgenda();
  });

  $('#cal-prev').addEventListener('click', () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); renderMonth(); });
  $('#cal-next').addEventListener('click', () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); renderMonth(); });
  $('#cal-today').addEventListener('click', () => {
    view = new Date(today().getFullYear(), today().getMonth(), 1);
    selected = isoDate(today());
    renderMonth();
    renderAgenda();
  });

  /* ---------- New event ---------- */
  const form = $('#event-form');
  const dateInput = $('#event-date');
  dateInput.defaultValue = isoDate(today());

  // "+" buttons open the window with the selected day already filled in.
  $$('[data-modal-open="event-modal"]').forEach((btn) => btn.addEventListener('click', () => { dateInput.value = selected; }));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    if (minutesOf(data.get('end')) <= minutesOf(data.get('start'))) {
      toast('The end time must be after the start time', { icon: 'circle-alert', tone: 'text-rose-500' });
      return;
    }
    events.push({
      date: data.get('date'),
      start: data.get('start'),
      end: data.get('end'),
      title: data.get('title').trim(),
      note: data.get('note').trim(),
      cat: data.get('category'),
    });
    selected = data.get('date');
    const date = parseKey(selected);
    view = new Date(date.getFullYear(), date.getMonth(), 1);
    renderAll();
    POS.closeModal('event-modal');
    toast('Event added');
  });

  renderAll();
})();
