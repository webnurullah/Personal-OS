/*
  Goals — each card's progress is calculated from its numbers (current ÷ target)
  or from its ticked milestones. The summary cards count the statuses you choose.
*/
(() => {
  const { $, $$, today, addDays, daysBetween, isoDate, fmt, pct, num, money, toast, icons } = POS;

  const CATEGORY = {
    Finance: { icon: 'piggy-bank', tile: 'bg-emerald-50 text-emerald-600', bar: 'bg-emerald-500' },
    Health: { icon: 'heart-pulse', tile: 'bg-blue-50 text-blue-600', bar: 'bg-blue-500' },
    Learning: { icon: 'graduation-cap', tile: 'bg-violet-50 text-violet-600', bar: 'bg-violet-500' },
    Personal: { icon: 'sparkles', tile: 'bg-pink-50 text-pink-600', bar: 'bg-pink-500' },
    Work: { icon: 'briefcase', tile: 'bg-sky-50 text-sky-600', bar: 'bg-sky-500' },
  };
  const STATUS_LABEL = { 'on-track': 'on track', behind: 'behind', completed: 'completed' };

  const grid = $('#goal-grid');
  const cards = () => $$('.goal', grid);
  let filter = 'active';
  let editing = null; // the card being updated

  const valueText = (n, unit) => (unit === '৳' ? money(n) : `${num(n)} ${unit}`);
  const parseDate = (key) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  function progressOf(card) {
    if (card.dataset.progress === 'milestones') {
      const boxes = $$('input[type="checkbox"]', card);
      const done = boxes.filter((b) => b.checked).length;
      return { percent: pct(done, boxes.length), label: `${done} of ${boxes.length} milestones` };
    }
    const current = Number(card.dataset.current);
    const target = Number(card.dataset.target);
    const unit = card.dataset.unit;
    return { percent: Math.min(100, pct(current, target)), label: `${valueText(current, unit)} of ${valueText(target, unit)}` };
  }

  function renderCard(card) {
    // Number-based milestones tick themselves: <input data-at="150000">
    $$('input[data-at]', card).forEach((box) => { box.checked = Number(card.dataset.current) >= Number(box.dataset.at); });

    const { percent, label } = progressOf(card);
    card.dataset.percent = percent;
    $('[data-pct]', card).textContent = `${percent}%`;
    $('[data-amount]', card).textContent = label;
    $('[data-bar]', card).style.width = `${percent}%`;

    const status = card.dataset.status;
    const select = $('[data-status-select]', card);
    select.value = status;
    select.dataset.status = status;

    const deadline = parseDate(card.dataset.deadline);
    const left = daysBetween(today(), deadline);
    $('[data-deadline-label]', card).textContent =
      status === 'completed' ? `Completed ${fmt(deadline, 'date')}`
      : left >= 0 ? `Due ${fmt(deadline, 'date')} · ${left} days left`
      : `Was due ${fmt(deadline, 'date')}`;
  }

  function renderSummary() {
    const active = cards().filter((c) => c.dataset.status !== 'completed');
    $('#sum-active').textContent = active.length;
    $('#sum-track').textContent = active.filter((c) => c.dataset.status === 'on-track').length;
    $('#sum-behind').textContent = active.filter((c) => c.dataset.status === 'behind').length;
    const average = active.length ? Math.round(active.reduce((sum, c) => sum + Number(c.dataset.percent), 0) / active.length) : 0;
    $('#sum-avg').textContent = `${average}%`;
  }

  function applyFilter() {
    let shown = 0;
    cards().forEach((card) => {
      const status = card.dataset.status;
      card.hidden = filter === 'active' ? status === 'completed' : status !== filter;
      if (!card.hidden) shown++;
    });
    $('#goal-empty').hidden = shown > 0;
  }

  function refresh(card) {
    if (card) renderCard(card);
    else cards().forEach(renderCard);
    renderSummary();
    applyFilter();
  }

  $('#goal-filter').addEventListener('tabchange', (e) => { filter = e.detail; applyFilter(); });

  grid.addEventListener('change', (e) => {
    const card = e.target.closest('.goal');
    if (!card) return;
    if (e.target.matches('[data-status-select]')) {
      card.dataset.status = e.target.value;
      toast(`Marked as ${STATUS_LABEL[e.target.value]}`);
    }
    refresh(card);
  });

  /* ---------- Update progress ---------- */
  grid.addEventListener('click', (e) => {
    const button = e.target.closest('[data-update]');
    if (!button) return;
    editing = button.closest('.goal');
    $('#update-goal').textContent = $('h3', editing).textContent;
    $('#update-value').value = editing.dataset.current;
    $('#update-unit').textContent = `of ${valueText(Number(editing.dataset.target), editing.dataset.unit)}`;
    POS.openModal('update-modal');
  });

  $('#update-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!editing) return;
    const value = Number($('#update-value').value);
    editing.dataset.current = value;
    refresh(editing);
    POS.closeModal('update-modal');
    if (value >= Number(editing.dataset.target) && editing.dataset.status !== 'completed') {
      toast('Target reached! Mark it as completed when you are ready.', { icon: 'party-popper', tone: 'text-amber-500' });
    } else {
      toast('Progress updated');
    }
  });

  /* ---------- New goal ---------- */
  const form = $('#goal-form');
  $('#goal-deadline').defaultValue = isoDate(addDays(today(), 90));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const category = data.get('category');
    const style = CATEGORY[category];

    const card = $('#goal-template').content.firstElementChild.cloneNode(true);
    card.dataset.target = data.get('target');
    card.dataset.unit = data.get('unit').trim() || '৳';
    card.dataset.deadline = data.get('deadline');
    $('[data-title]', card).textContent = data.get('title').trim();
    $('[data-category]', card).textContent = category;
    $('[data-tile]', card).classList.add(...style.tile.split(' '));
    $('[data-icon]', card).setAttribute('data-lucide', style.icon);
    $('[data-bar]', card).classList.add(style.bar);

    grid.prepend(card);
    icons(card);
    refresh(card);
    POS.closeModal('goal-modal');
    toast('Goal created. Good luck!');
  });

  refresh();
})();
