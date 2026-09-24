/*
  Health — today's numbers, 7-day charts and the heart-rate trend.
  Charts read their numbers from data-values in the HTML; "Log today" replaces today's value everywhere.
*/
(() => {
  const { $, today, addDays, fmt, pct, hm, donut, toast, icons } = POS;

  const read = (el) => el.dataset.values.split(',').map(Number);
  const last = (list) => list[list.length - 1];
  const average = (list) => list.reduce((a, b) => a + b, 0) / list.length;
  const count = (n) => Math.round(n).toLocaleString('en-US');

  const STEP_GOAL = Number($('#steps-chart').dataset.goal);
  const SLEEP_GOAL = Number($('#sleep-chart').dataset.goal);
  const WATER_GOAL = 8;
  const state = {
    steps: read($('#steps-chart')),
    sleep: read($('#sleep-chart')),
    hr: read($('#hr-chart')),
    weight: read($('#weight-spark')),
    water: 6,
    mood: 8,
  };

  /* ---------- Small charts ---------- */
  function sparkline(svg, values) {
    const w = 120, h = 28, pad = 4;
    const min = Math.min(...values), range = Math.max(...values) - min || 1;
    const points = values.map((v, i) => [(i / (values.length - 1)) * (w - pad * 2) + pad, h - pad - ((v - min) / range) * (h - pad * 2)]);
    const [lx, ly] = last(points);
    svg.innerHTML = `<polyline points="${points.map((p) => p.join(',')).join(' ')}"/><circle cx="${lx}" cy="${ly}" r="3" fill="currentColor" stroke="none"/>`;
  }

  // Seven bars with a dashed goal line. Bars that reach the goal are darker.
  function barChart(el, values, { goal, max, done, notDone, format }) {
    const bars = values
      .map((v, i) => {
        const back = values.length - 1 - i;
        const label = back === 0 ? 'Today' : fmt(addDays(today(), -back), 'long');
        return `<span class="w-full max-w-11 justify-self-center rounded-t-lg ${v >= goal ? done : notDone}" style="height:${Math.min(v / max, 1) * 100}%" title="${label}: ${format(v)}"></span>`;
      })
      .join('');
    const days = values
      .map((v, i) => {
        const back = values.length - 1 - i;
        return `<span class="${back === 0 ? 'font-semibold text-blue-600' : ''}">${back === 0 ? 'Today' : fmt(addDays(today(), -back), 'weekday')}</span>`;
      })
      .join('');
    el.innerHTML = `
      <div class="relative h-44">
        <div class="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-dashed border-slate-300" style="bottom:${(goal / max) * 100}%">
          <span class="absolute -top-5 right-0 rounded bg-white px-1 text-[10px] font-medium text-slate-500">Goal ${format(goal)}</span>
        </div>
        <div class="grid h-full grid-cols-7 items-end gap-2 sm:gap-4">${bars}</div>
      </div>
      <div class="mt-2 grid grid-cols-7 gap-2 text-center text-[11px] text-slate-500 sm:gap-4">${days}</div>`;
  }

  function lineChart(el, values) {
    const w = 640, h = 180, padX = 36, padY = 14;
    const min = Math.floor(Math.min(...values) - 2);
    const max = Math.ceil(Math.max(...values) + 2);
    const x = (i) => padX + (i / (values.length - 1)) * (w - padX - 10);
    const y = (v) => padY + (1 - (v - min) / (max - min)) * (h - padY * 2);
    const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const area = `${line} L${x(values.length - 1).toFixed(1)},${h - padY} L${x(0).toFixed(1)},${h - padY} Z`;
    const ticks = [min, Math.round((min + max) / 2), max];
    const back = (i) => values.length - 1 - i;
    const dateLabels = [0, Math.floor((values.length - 1) / 2), values.length - 1]
      .map((i, k) => `<text x="${x(i)}" y="${h + 12}" text-anchor="${['start', 'middle', 'end'][k]}">${back(i) === 0 ? 'Today' : fmt(addDays(today(), -back(i)), 'short')}</text>`)
      .join('');

    el.innerHTML = `
      <svg viewBox="0 0 ${w} ${h + 18}" class="h-auto w-full" role="img" aria-label="Resting heart rate for the last ${values.length} days">
        <defs><linearGradient id="hr-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ec4899" stop-opacity=".22"/><stop offset="1" stop-color="#ec4899" stop-opacity="0"/></linearGradient></defs>
        <g fill="#94a3b8" font-size="11">
          ${ticks.map((t) => `<line x1="${padX}" x2="${w - 10}" y1="${y(t)}" y2="${y(t)}" stroke="#e2e8f0" stroke-dasharray="4 4"/><text x="${padX - 8}" y="${y(t) + 4}" text-anchor="end">${t}</text>`).join('')}
          ${dateLabels}
        </g>
        <path d="${area}" fill="url(#hr-fill)"/>
        <path d="${line}" fill="none" stroke="#ec4899" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
        ${values.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="${i === values.length - 1 ? 5 : 3.5}" fill="${i === values.length - 1 ? '#ec4899' : '#fff'}" stroke="#ec4899" stroke-width="2"><title>${back(i) === 0 ? 'Today' : fmt(addDays(today(), -back(i)), 'long')}: ${v} bpm</title></circle>`).join('')}
      </svg>`;
  }

  /* ---------- Render ---------- */
  function renderToday() {
    const steps = last(state.steps);
    const sleep = last(state.sleep);

    const stepShare = pct(steps, STEP_GOAL);
    donut($('#steps-ring'), [{ value: Math.min(stepShare, 100), color: '#10b981' }], { max: 100, thickness: 12, round: true });
    $('#steps-pct').textContent = `${stepShare}%`;
    $('#steps-today').textContent = count(steps);
    $('#steps-left').textContent = steps >= STEP_GOAL ? 'Goal reached!' : `${count(STEP_GOAL - steps)} to go`;

    const sleepShare = pct(sleep, SLEEP_GOAL);
    donut($('#sleep-ring'), [{ value: Math.min(sleepShare, 100), color: '#8b5cf6' }], { max: 100, thickness: 12, round: true });
    $('#sleep-pct').textContent = `${sleepShare}%`;
    $('#sleep-today').textContent = hm(sleep);

    $('#hr-today').textContent = last(state.hr);
    sparkline($('#hr-spark'), state.hr.slice(-7));

    const weight = last(state.weight);
    const change = weight - state.weight[0];
    $('#weight-today').textContent = weight.toFixed(1);
    const down = change <= 0;
    $('#weight-change').className = `flex items-center gap-1 text-sm ${down ? 'text-emerald-600' : 'text-amber-600'}`;
    $('#weight-change').innerHTML = `<i data-lucide="${down ? 'trending-down' : 'trending-up'}" class="size-4"></i>${Math.abs(change).toFixed(1)} kg ${down ? 'down' : 'up'} this month`;
    icons($('#weight-change'));
    sparkline($('#weight-spark'), state.weight);
  }

  function renderCharts() {
    barChart($('#steps-chart'), state.steps, { goal: STEP_GOAL, max: Number($('#steps-chart').dataset.max), done: 'bg-emerald-500', notDone: 'bg-emerald-200', format: (v) => count(v) });
    $('#steps-avg').textContent = count(average(state.steps));
    $('#steps-hit').textContent = state.steps.filter((v) => v >= STEP_GOAL).length;

    barChart($('#sleep-chart'), state.sleep, { goal: SLEEP_GOAL, max: Number($('#sleep-chart').dataset.max), done: 'bg-violet-500', notDone: 'bg-violet-200', format: hm });
    $('#sleep-avg').textContent = hm(average(state.sleep));
    $('#sleep-hit').textContent = state.sleep.filter((v) => v >= SLEEP_GOAL).length;

    lineChart($('#hr-chart'), state.hr);
    $('#hr-avg').textContent = Math.round(average(state.hr));
  }

  function renderWater() {
    const shown = Math.max(WATER_GOAL, state.water);
    $('#water-count').textContent = state.water;
    $('#water-glasses').innerHTML = Array.from({ length: shown }, (_, i) => `<i data-lucide="glass-water" class="size-5 ${i < state.water ? 'fill-sky-200 text-sky-500' : 'text-slate-300'}"></i>`).join('');
    icons($('#water-glasses'));
    $('#water-minus').disabled = state.water <= 0;
  }

  // Score → [icon, label, tile colours, label colour]
  function moodStyle(score) {
    if (score <= 3) return ['frown', 'Having a hard day', 'bg-slate-100 text-slate-500', 'text-slate-500'];
    if (score <= 5) return ['meh', 'Getting by', 'bg-amber-50 text-amber-500', 'text-amber-600'];
    if (score <= 7) return ['smile', 'Feeling good', 'bg-emerald-50 text-emerald-500', 'text-emerald-600'];
    return ['laugh', 'Feeling great', 'bg-pink-50 text-pink-500', 'text-pink-600'];
  }

  function renderMood() {
    const [icon, label, tile, tone] = moodStyle(state.mood);
    $('#mood-score').textContent = state.mood;
    $('#mood-label').textContent = label;
    $('#mood-label').className = `text-sm font-medium ${tone}`;
    const face = $('#mood-face');
    face.className = `grid size-16 shrink-0 place-items-center rounded-2xl ${tile}`;
    face.innerHTML = `<i data-lucide="${icon}" class="size-9"></i>`;
    icons(face);
    $('#mood-picker').innerHTML = Array.from({ length: 10 }, (_, i) => i + 1)
      .map((n) => `<button type="button" data-score="${n}" aria-pressed="${n === state.mood}" class="h-9 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 transition hover:border-pink-300 aria-pressed:border-pink-500 aria-pressed:bg-pink-500 aria-pressed:text-white">${n}</button>`)
      .join('');
  }

  /* ---------- Interactions ---------- */
  $('#water-plus').addEventListener('click', () => {
    state.water = Math.min(12, state.water + 1);
    renderWater();
    if (state.water === WATER_GOAL) toast('Water goal reached. Nice!', { icon: 'glass-water', tone: 'text-sky-500' });
  });
  $('#water-minus').addEventListener('click', () => { state.water = Math.max(0, state.water - 1); renderWater(); });

  $('#mood-picker').addEventListener('click', (e) => {
    const button = e.target.closest('[data-score]');
    if (!button) return;
    state.mood = Number(button.dataset.score);
    renderMood();
  });

  // Open "Log today" with today's numbers filled in, ready to edit.
  document.querySelector('[data-modal-open="log-modal"]').addEventListener('click', () => {
    const sleep = last(state.sleep);
    $('#log-steps').value = last(state.steps);
    $('#log-hr').value = last(state.hr);
    $('#log-sleep-h').value = Math.floor(sleep);
    $('#log-sleep-m').value = Math.round((sleep % 1) * 60);
    $('#log-weight').value = last(state.weight);
  });

  $('#log-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    const number = (name) => (data.get(name) === '' ? null : Number(data.get(name)));
    const setToday = (list, value) => { if (value !== null && !Number.isNaN(value)) list[list.length - 1] = value; };

    setToday(state.steps, number('steps'));
    setToday(state.hr, number('hr'));
    setToday(state.weight, number('weight'));
    if (number('sleepH') !== null || number('sleepM') !== null) setToday(state.sleep, (number('sleepH') || 0) + (number('sleepM') || 0) / 60);

    renderToday();
    renderCharts();
    POS.closeModal('log-modal');
    toast("Today's health saved");
  });

  renderToday();
  renderCharts();
  renderWater();
  renderMood();
})();
