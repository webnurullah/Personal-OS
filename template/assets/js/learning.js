/*
  Learning — the weekly goal and the ticked blocks give every number on this page:
  hours completed, hours remaining and the % of the weekly goal.
*/
(() => {
  const { $, $$, today, daysBetween, fmt, pct, num, hm, toast } = POS;

  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const STATUS = {
    done: '<span class="badge bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-100">Completed</span>',
    pending: '<span class="badge bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">Pending</span>',
  };

  let goal = 8; // weekly goal in hours
  const list = $('#blocks');
  const blocks = () => $$('#blocks > li');
  const hoursOf = (li) => Number(li.dataset.hours);
  const isDone = (li) => $('input', li).checked;

  function render() {
    const all = blocks();
    const done = all.filter(isDone).reduce((sum, li) => sum + hoursOf(li), 0);
    const planned = all.reduce((sum, li) => sum + hoursOf(li), 0);
    const left = Math.max(goal - done, 0);
    const share = Math.min(100, pct(done, goal));

    all.forEach((li) => { $('[data-status]', li).innerHTML = isDone(li) ? STATUS.done : STATUS.pending; });
    $('#goal-hours').textContent = num(goal);
    $('#goal-pct').textContent = `${share}%`;
    $('#goal-bar').style.width = `${share}%`;
    $('#done-time').textContent = hm(done);
    $('#left-time').textContent = hm(left);
    $('#left-big').textContent = left ? hm(left) : 'Goal reached!';
    $('#goal-minus').disabled = goal <= 0.5;

    const note = $('#plan-note');
    const short = goal - planned;
    note.textContent = short > 0
      ? `Your blocks cover ${hm(planned)} of your ${hm(goal)} goal. Plan ${hm(short)} more.`
      : `Your blocks cover ${hm(planned)} of your ${hm(goal)} goal.`;
    note.classList.toggle('text-amber-600', short > 0);
    note.classList.toggle('text-slate-500', short <= 0);
  }

  list.addEventListener('change', render);
  $('#goal-minus').addEventListener('click', () => { goal = Math.max(0.5, goal - 0.5); render(); });
  $('#goal-plus').addEventListener('click', () => { goal = Math.min(40, goal + 0.5); render(); });

  /* ---------- Course card: target date countdown ---------- */
  const iqaTarget = new Date(2026, 11, 31); // 31 Dec 2026, from the course tracker
  const daysLeft = daysBetween(today(), iqaTarget);
  $('#iqa-due').textContent = fmt(iqaTarget, 'date');
  $('#iqa-weeks').textContent = daysLeft >= 0 ? `${Math.ceil(daysLeft / 7)} weeks left` : 'target date has passed';

  /* ---------- Log a study session (adds a block) ---------- */
  const todayName = DAYS[(today().getDay() + 6) % 7];
  $$('#session-day option').forEach((option) => { option.defaultSelected = option.value === todayName; });
  $('#session-day').value = todayName;

  let nextId = 10;
  $('#session-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    const day = data.get('day');
    const hours = Number(data.get('hours'));
    const id = `b-${nextId++}`;

    const li = $('#block-template').content.firstElementChild.cloneNode(true);
    li.dataset.hours = hours;
    const box = $('input', li);
    box.id = id;
    box.checked = data.get('done') === 'on';
    const label = $('[data-day]', li);
    label.htmlFor = id;
    label.textContent = day;
    $('[data-hours-label]', li).textContent = `${num(hours)}h`;
    $('[data-what]', li).textContent = data.get('what').trim();

    // Keep the list in weekday order.
    const later = blocks().find((other) => DAYS.indexOf($('label', other).textContent) > DAYS.indexOf(day));
    list.insertBefore(li, later || null);

    render();
    POS.closeModal('session-modal');
    toast(box.checked ? `${hm(hours)} added to this week` : 'Block planned');
  });

  render();
})();
