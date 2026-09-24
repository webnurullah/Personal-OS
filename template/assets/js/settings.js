/*
  Settings — switch sections, "save" (for this visit only), add or remove categories.
*/
(() => {
  const { $, $$, toast, icons, escapeHTML } = POS;
  const later = () => toast('This works once the app has a database', { icon: 'info', tone: 'text-blue-600' });

  // settings.html#profile (or #notifications, …) opens that section.
  function openFromHash() {
    const tab = $(`#settings-tabs [data-tab="${window.location.hash.slice(1)}"]`);
    if (tab) tab.click();
  }
  window.addEventListener('hashchange', openFromHash);
  openFromHash();

  $$('.settings-form').forEach((form) =>
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      toast('Saved for this visit. Real saving comes with the database.', { icon: 'info', tone: 'text-blue-600' });
    })
  );

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-soon]')) later();
  });

  /* ---------- Categories ---------- */
  $('#category-chips').addEventListener('click', (e) => {
    const button = e.target.closest('[data-remove]');
    if (!button) return;
    const chip = button.closest('li');
    chip.remove();
    toast(`Removed “${chip.textContent.trim()}”`, { icon: 'trash-2', tone: 'text-rose-500' });
  });

  $('#category-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    const name = escapeHTML(data.get('name').trim());
    const list = $('#category-chips');
    list.insertAdjacentHTML(
      'beforeend',
      `<li class="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1.5 pl-3 pr-1.5 text-sm font-medium text-slate-700"><span class="size-2.5 rounded-full ${data.get('color')}"></span>${name}<button type="button" class="grid size-6 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700" data-remove aria-label="Remove ${name}"><i data-lucide="x" class="size-3.5"></i></button></li>`
    );
    icons(list.lastElementChild);
    e.target.reset();
    toast(`Added “${data.get('name').trim()}”`);
  });
})();
