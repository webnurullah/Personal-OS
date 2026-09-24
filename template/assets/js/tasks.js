/*
  Tasks — filter, search, tick, add and delete.
  The summary cards and the side panel are calculated from the list every time it changes.
*/
(() => {
  const { $, $$, today, addDays, daysBetween, isoDate, relativeDay, pct, donut, toast, icons } = POS;

  // Category → [badge classes, colour]
  const CATEGORY = {
    Work: ['bg-blue-50 text-blue-700', '#3b82f6'],
    Finance: ['bg-amber-50 text-amber-700', '#f59e0b'],
    Health: ['bg-emerald-50 text-emerald-700', '#10b981'],
    Personal: ['bg-violet-50 text-violet-700', '#8b5cf6'],
    Home: ['bg-orange-50 text-orange-700', '#f97316'],
    Learning: ['bg-teal-50 text-teal-700', '#14b8a6'],
  };
  const PRIORITY = { high: ['text-rose-500', 'High'], medium: ['text-amber-500', 'Medium'], low: ['text-slate-400', 'Low'] };

  const groups = $('#task-groups');
  const tasks = () => $$('.task', groups);
  const offsetOf = (li) => Number(li.dataset.offset);
  const isDone = (li) => $('input', li).checked;
  let filter = 'all';

  function fillDue(li) {
    const due = $('[data-due]', li);
    due.textContent = relativeDay(addDays(today(), offsetOf(li)));
    due.parentElement.classList.toggle('text-rose-500', offsetOf(li) < 0 && !isDone(li));
  }

  // Past tasks move between "Overdue" and "Done earlier" when you tick or untick them.
  function placeInGroup(li) {
    const off = offsetOf(li);
    const name = off < 0 ? (isDone(li) ? 'earlier' : 'overdue') : off === 0 ? 'today' : 'upcoming';
    const list = $(`[data-group="${name}"] ul`, groups);
    if (li.parentElement === list) return;
    const later = $$('.task', list).find((other) => offsetOf(other) > off); // keep lists in date order
    list.insertBefore(li, later || null);
  }

  function matches(li) {
    const query = $('#task-search').value.trim().toLowerCase();
    const category = $('#task-category').value;
    const off = offsetOf(li);
    const inTab = { all: true, today: off === 0, upcoming: off > 0, overdue: off < 0 && !isDone(li), done: isDone(li) }[filter];
    return inTab && (!category || li.dataset.category === category) && (!query || li.textContent.toLowerCase().includes(query));
  }

  function render() {
    let visible = 0;
    tasks().forEach((li) => {
      fillDue(li);
      li.hidden = !matches(li);
      if (!li.hidden) visible++;
    });
    $$('[data-group]', groups).forEach((group) => {
      const shown = $$('.task', group).filter((li) => !li.hidden).length;
      group.hidden = shown === 0;
      $('[data-count]', group).textContent = shown;
    });
    $('#task-empty').hidden = visible > 0;
    renderSummary();
  }

  function renderSummary() {
    const all = tasks();
    const open = all.filter((li) => !isDone(li));
    const todays = all.filter((li) => offsetOf(li) === 0);
    const doneToday = todays.filter(isDone).length;

    $('#sum-today').textContent = `${doneToday} / ${todays.length}`;
    $('#sum-overdue').textContent = open.filter((li) => offsetOf(li) < 0).length;
    $('#sum-week').textContent = open.filter((li) => offsetOf(li) > 0 && offsetOf(li) <= 7).length;
    $('#sum-done').textContent = all.filter(isDone).length;

    const done = pct(doneToday, todays.length);
    donut($('#today-ring'), [{ value: done, color: '#3b82f6' }], { max: 100, thickness: 12, round: true });
    $('#today-pct').textContent = `${done}%`;
    const left = todays.length - doneToday;
    $('#today-left').textContent = `${left} ${left === 1 ? 'task' : 'tasks'}`;

    const counts = {};
    open.forEach((li) => { counts[li.dataset.category] = (counts[li.dataset.category] || 0) + 1; });
    const most = Math.max(1, ...Object.values(counts));
    $('#category-list').innerHTML = Object.entries(CATEGORY)
      .map(([name, [, color]]) => {
        const n = counts[name] || 0;
        return `
        <li class="flex items-center gap-3 text-sm">
          <span class="size-2.5 shrink-0 rounded-full" style="background:${color}"></span>
          <span class="w-20 text-slate-700">${name}</span>
          <div class="progress h-1.5 flex-1"><span style="width:${(n / most) * 100}%;background:${color}"></span></div>
          <span class="w-5 text-right font-semibold text-slate-800">${n}</span>
        </li>`;
      })
      .join('');
  }

  $('#task-filter').addEventListener('tabchange', (e) => { filter = e.detail; render(); });
  $('#task-search').addEventListener('input', render);
  $('#task-category').addEventListener('change', render);

  groups.addEventListener('change', (e) => {
    const li = e.target.closest('.task');
    if (!li) return;
    placeInGroup(li);
    render();
  });

  groups.addEventListener('click', (e) => {
    const button = e.target.closest('[data-delete]');
    if (!button) return;
    const li = button.closest('.task');
    const title = $('label span', li).textContent;
    li.remove();
    render();
    toast(`Deleted “${title}”`, { icon: 'trash-2', tone: 'text-rose-500' });
  });

  /* ---------- New task ---------- */
  let nextId = 100;
  const form = $('#task-form');
  $('#task-due').defaultValue = isoDate(today());

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const [y, m, d] = data.get('due').split('-').map(Number);
    const category = data.get('category');
    const priority = data.get('priority');
    const id = `t-${nextId++}`;

    const li = $('#task-template').content.firstElementChild.cloneNode(true);
    li.dataset.offset = daysBetween(today(), new Date(y, m - 1, d));
    li.dataset.category = category;
    li.dataset.priority = priority;
    $('input', li).id = id;
    $('label', li).htmlFor = id;
    $('[data-title]', li).textContent = data.get('title').trim();
    const badge = $('[data-badge]', li);
    badge.textContent = category;
    badge.classList.add(...CATEGORY[category][0].split(' '));
    const flag = $('[data-priority-label]', li);
    flag.classList.add(PRIORITY[priority][0]);
    $('span', flag).textContent = PRIORITY[priority][1];

    placeInGroup(li);
    icons(li);
    render();
    POS.closeModal('task-modal');
    toast('Task added');
    li.classList.add('bg-blue-50');
    setTimeout(() => li.classList.remove('bg-blue-50'), 1600);
  });

  render();
})();
