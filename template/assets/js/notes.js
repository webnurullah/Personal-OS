/*
  Notes — search, filter by tag, pin, delete and add notes. Reminders can be ticked or added.
*/
(() => {
  const { $, $$, toast, icons, escapeHTML } = POS;

  const COLORS = {
    white: 'border-slate-200 bg-white',
    amber: 'border-amber-200/70 bg-amber-50',
    sky: 'border-sky-200/70 bg-sky-50',
    emerald: 'border-emerald-200/70 bg-emerald-50',
    violet: 'border-violet-200/70 bg-violet-50',
    rose: 'border-rose-200/70 bg-rose-50',
  };
  const pinnedGrid = $('#pinned-grid');
  const otherGrid = $('#notes-grid');
  const notes = () => $$('.note');

  function render() {
    const query = $('#note-search').value.trim().toLowerCase();
    const tag = $('#note-tag').value;
    let shown = 0;
    notes().forEach((note) => {
      note.hidden = !((!tag || note.dataset.tag === tag) && (!query || note.textContent.toLowerCase().includes(query)));
      if (!note.hidden) shown++;
    });
    const visibleIn = (grid) => $$('.note', grid).filter((n) => !n.hidden).length;
    $('#pinned-section').hidden = visibleIn(pinnedGrid) === 0;
    otherGrid.parentElement.hidden = visibleIn(otherGrid) === 0;
    $('#note-empty').hidden = shown > 0;
    $('#note-count').textContent = `${shown} ${shown === 1 ? 'note' : 'notes'}`;
  }

  function setPinned(note, pinned) {
    const button = $('[data-pin]', note);
    button.setAttribute('aria-pressed', String(pinned));
    button.setAttribute('aria-label', pinned ? 'Unpin note' : 'Pin note');
    button.classList.toggle('text-blue-600', pinned);
    $('svg', button)?.classList.toggle('fill-current', pinned);
    (pinned ? pinnedGrid : otherGrid).prepend(note);
  }

  $('#note-search').addEventListener('input', render);
  $('#note-tag').addEventListener('change', render);

  document.addEventListener('click', (e) => {
    const note = e.target.closest('.note');
    if (!note) return;
    if (e.target.closest('[data-pin]')) {
      const pinned = $('[data-pin]', note).getAttribute('aria-pressed') !== 'true';
      setPinned(note, pinned);
      render();
      toast(pinned ? 'Note pinned' : 'Note unpinned', { icon: 'pin', tone: 'text-blue-600' });
    } else if (e.target.closest('[data-delete]')) {
      const title = $('h3', note).textContent;
      note.remove();
      render();
      toast(`Deleted “${title}”`, { icon: 'trash-2', tone: 'text-rose-500' });
    }
  });

  /* ---------- New note ---------- */
  $('#note-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    const color = data.get('color');
    const lines = data.get('body').split('\n').map((line) => line.trim()).filter(Boolean);
    const isList = lines.length > 0 && lines.every((line) => line.startsWith('- '));
    const body = isList
      ? `<ul class="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-700">${lines.map((line) => `<li>${escapeHTML(line.slice(2))}</li>`).join('')}</ul>`
      : lines.map((line) => `<p class="mt-2 text-sm leading-relaxed text-slate-700">${escapeHTML(line)}</p>`).join('');

    const note = document.createElement('article');
    note.className = `note group mb-5 break-inside-avoid rounded-2xl border p-5 ${COLORS[color]}`;
    note.dataset.tag = data.get('tag');
    note.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <h3 class="font-semibold text-slate-900">${escapeHTML(data.get('title').trim())}</h3>
        <div class="flex shrink-0 gap-0.5 opacity-60 transition group-hover:opacity-100">
          <button type="button" class="btn btn-ghost btn-sm btn-icon" data-pin aria-pressed="false" aria-label="Pin note"><i data-lucide="pin" class="size-4"></i></button>
          <button type="button" class="btn btn-ghost btn-sm btn-icon" data-delete aria-label="Delete note"><i data-lucide="trash-2" class="size-4"></i></button>
        </div>
      </div>
      ${body}
      <div class="mt-4 flex items-center justify-between text-xs text-slate-500"><span class="badge ${color === 'white' ? 'bg-slate-100' : 'bg-white/70'} text-slate-600">${escapeHTML(data.get('tag'))}</span><span>Today</span></div>`;
    icons(note);
    setPinned(note, data.get('pinned') === 'on');
    // Clear filters so the new note is visible
    $('#note-search').value = '';
    $('#note-tag').value = '';
    render();
    POS.closeModal('note-modal');
    toast('Note saved');
  });

  /* ---------- Reminders ---------- */
  function renderReminders() {
    const open = $$('#reminders input').filter((box) => !box.checked).length;
    $('#rem-count').textContent = `${open} open`;
  }
  $('#reminders').addEventListener('change', renderReminders);

  let reminderId = 100;
  $('#rem-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = e.target.elements.text;
    const text = input.value.trim();
    if (!text) return;
    const id = `r-${reminderId++}`;
    $('#reminders').insertAdjacentHTML(
      'beforeend',
      `<li class="flex items-start gap-2.5"><input id="${id}" type="checkbox" class="checkbox peer mt-0.5"><label for="${id}" class="flex-1 text-sm text-slate-700 peer-checked:text-slate-400 peer-checked:line-through">${escapeHTML(text)}</label><span class="text-xs text-slate-400">No date</span></li>`
    );
    input.value = '';
    renderReminders();
    toast('Reminder added');
  });

  render();
  renderReminders();
})();
