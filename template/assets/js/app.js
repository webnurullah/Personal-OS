/*
  Nurullah POS — shared layout and helpers.
  Every page loads this file first, then its own script (dashboard.js, tasks.js, ...).
  There is no database: the sample data lives in the HTML, and changes last until you reload.
*/
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const escapeHTML = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  /* ================= Navigation ================= */
  const NAV = [
    { id: 'dashboard', label: 'Dashboard', href: 'index.html', icon: 'house' },
    { id: 'tasks', label: 'Tasks', href: 'tasks.html', icon: 'square-check' },
    { id: 'calendar', label: 'Calendar', href: 'calendar.html', icon: 'calendar-days' },
    { id: 'goals', label: 'Goals', href: 'goals.html', icon: 'target' },
    { id: 'habits', label: 'Habits', href: 'habits.html', icon: 'chart-column' },
    { id: 'learning', label: 'Learning', href: 'learning.html', icon: 'graduation-cap' },
    { id: 'finance', label: 'Finance', href: 'finance.html', icon: 'wallet' },
    { id: 'health', label: 'Health', href: 'health.html', icon: 'heart' },
    { id: 'notes', label: 'Notes', href: 'notes.html', icon: 'file-text' },
  ];
  const SETTINGS = { id: 'settings', label: 'Settings', href: 'settings.html', icon: 'settings' };

  // Items in the Ctrl+K search. "searchOnly" items appear only while typing.
  const COMMANDS = [
    ...[...NAV, SETTINGS].map((n) => ({ group: 'Pages', label: n.label, href: n.href, icon: n.icon })),
    { group: 'Pages', label: 'IQA Course Tracker', href: 'course.html', icon: 'book-open' },
    { group: 'Quick actions', label: 'New task', href: 'tasks.html#new', icon: 'plus' },
    { group: 'Quick actions', label: 'New event', href: 'calendar.html#new', icon: 'calendar-plus' },
    { group: 'Quick actions', label: 'Log a study session', href: 'learning.html#new', icon: 'timer' },
    { group: 'Quick actions', label: 'Add a transaction', href: 'finance.html#new', icon: 'banknote' },
    { group: 'Quick actions', label: "Log today's health", href: 'health.html#new', icon: 'heart-pulse' },
    { group: 'Quick actions', label: 'New note', href: 'notes.html#new', icon: 'notebook-pen' },
    { group: 'Quick actions', label: 'New goal', href: 'goals.html#new', icon: 'target' },
    { group: 'Quick actions', label: 'New habit', href: 'habits.html#new', icon: 'repeat' },
    { group: 'Results', label: 'Finish project proposal', hint: 'Task', href: 'tasks.html', icon: 'square-check', searchOnly: true },
    { group: 'Results', label: 'Pay electricity bill', hint: 'Task · overdue', href: 'tasks.html', icon: 'square-check', searchOnly: true },
    { group: 'Results', label: 'Build Emergency Fund', hint: 'Goal · 70%', href: 'goals.html', icon: 'piggy-bank', searchOnly: true },
    { group: 'Results', label: 'Travel to Japan', hint: 'Goal · 25%', href: 'goals.html', icon: 'plane', searchOnly: true },
    { group: 'Results', label: 'Japan trip ideas', hint: 'Note', href: 'notes.html', icon: 'sticky-note', searchOnly: true },
    { group: 'Results', label: 'Level 4 IQA Award', hint: 'Course', href: 'course.html', icon: 'graduation-cap', searchOnly: true },
    { group: 'Results', label: 'Dentist appointment', hint: 'Event', href: 'calendar.html', icon: 'calendar-days', searchOnly: true },
    { group: 'Results', label: 'Drink Water', hint: 'Habit · 21-day streak', href: 'habits.html', icon: 'glass-water', searchOnly: true },
  ];

  /* ================= Dates ================= */
  const DAY_MS = 864e5;
  const FORMATS = {
    full: { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }, // Mon, Sep 21, 2026
    long: { weekday: 'long', month: 'long', day: 'numeric' }, // Monday, September 21
    date: { month: 'short', day: 'numeric', year: 'numeric' }, // Sep 21, 2026
    short: { month: 'short', day: 'numeric' }, // Sep 21
    weekday: { weekday: 'short' }, // Mon
    weekdayLong: { weekday: 'long' }, // Monday
    month: { month: 'long', year: 'numeric' }, // September 2026
    monthShort: { month: 'short', year: 'numeric' }, // Sep 2026
  };

  function today() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
  function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }
  const daysBetween = (a, b) => Math.round((b - a) / DAY_MS);
  const fmt = (date, format = 'short') => new Intl.DateTimeFormat('en-US', FORMATS[format] || format).format(date);
  const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  function relativeDay(date) {
    const diff = daysBetween(today(), date);
    if (diff === 0) return 'Today';
    if (diff === -1) return 'Yesterday';
    if (diff === 1) return 'Tomorrow';
    if (diff > 1 && diff < 7) return fmt(date, 'weekdayLong');
    return fmt(date, 'short');
  }

  // Sample dates are written as "days from today", so the template never looks out of date:
  // <span data-date-offset="3" data-date-format="short"></span>  →  "Sep 24"
  function fillDates(root = document) {
    $$('[data-date-offset]', root).forEach((el) => {
      const date = addDays(today(), Number(el.dataset.dateOffset));
      const format = el.dataset.dateFormat || 'short';
      el.textContent = format === 'relative' ? relativeDay(date) : fmt(date, format);
      if (el.tagName === 'TIME') el.dateTime = isoDate(date);
    });
  }

  const greeting = (now = new Date()) => (now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening');
  const minutesOf = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  // "13:30" → "1:30 PM"
  function time12(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  }

  /* ================= Numbers ================= */
  // 140000 → "৳1,40,000" (Bangladeshi lakh grouping)
  const money = (n) => `${n < 0 ? '−' : ''}৳${Math.abs(Math.round(n)).toLocaleString('en-IN')}`;
  const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
  const num = (n) => String(Math.round(n * 10) / 10); // 7.5 → "7.5", 7 → "7"
  // 2.5 → "2h 30m"
  function hm(hours) {
    const total = Math.round(hours * 60);
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (!h) return `${m}m`;
    return m ? `${h}h ${m}m` : `${h}h`;
  }

  /* ================= Icons (Lucide) ================= */
  function icons(root = document) {
    if (window.lucide) window.lucide.createIcons({ root });
  }

  /* ================= Donut chart ================= */
  // donut(el, [{ value: 35, color: '#60a5fa' }, ...]) draws an SVG ring that fills el.
  // Pass { max: 100 } to draw a progress ring instead of splitting the whole circle.
  function donut(el, segments, { thickness = 16, gap = 1.2, track = '#edf1f6', max, round = false } = {}) {
    const r = (100 - thickness) / 2;
    const c = 2 * Math.PI * r;
    const total = max || segments.reduce((s, x) => s + x.value, 0);
    const useGap = !round && segments.filter((s) => s.value > 0).length > 1;
    let offset = 0;
    const arcs = segments
      .map((s) => {
        if (!total || s.value <= 0) return '';
        const len = (Math.min(s.value, total) / total) * c;
        const dash = Math.max(len - (useGap ? gap : 0), 0.01);
        const arc = `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${s.color}" stroke-width="${thickness}" stroke-dasharray="${dash} ${c}" stroke-dashoffset="${-offset}"${round ? ' stroke-linecap="round"' : ''}/>`;
        offset += len;
        return arc;
      })
      .join('');
    el.innerHTML = `<svg viewBox="0 0 100 100" class="block size-full -rotate-90" aria-hidden="true"><circle cx="50" cy="50" r="${r}" fill="none" stroke="${track}" stroke-width="${thickness}"/>${arcs}</svg>`;
  }

  /* ================= Toasts ================= */
  function toast(message, { icon = 'circle-check', tone = 'text-emerald-600' } = {}) {
    const el = document.createElement('div');
    el.className = 'pointer-events-auto flex max-w-sm items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-lg';
    el.style.cssText = 'opacity:0;transform:translateY(8px);transition:opacity .25s,transform .25s';
    el.innerHTML = `<i data-lucide="${icon}" class="size-5 shrink-0 ${tone}"></i><span>${escapeHTML(message)}</span>`;
    $('#toasts').appendChild(el);
    icons(el);
    requestAnimationFrame(() => requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'none'; }));
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      setTimeout(() => el.remove(), 300);
    }, 2800);
  }

  /* ================= Modals (native <dialog>) ================= */
  function openModal(id) {
    const dlg = document.getElementById(id);
    if (!dlg || dlg.open) return;
    dlg.showModal();
    const first = dlg.querySelector('[autofocus]') || dlg.querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea');
    if (first) first.focus();
  }
  function closeModal(target) {
    const dlg = typeof target === 'string' ? document.getElementById(target) : target;
    if (!dlg || !dlg.open) return;
    dlg.close();
    dlg.querySelector('form')?.reset(); // so it opens clean next time
  }

  /* ================= Layout: sidebar + top bar ================= */
  const avatar = (size) => `
    <span class="${size} block shrink-0 overflow-hidden rounded-full shadow-sm ring-2 ring-white">
      <svg viewBox="0 0 40 40" class="block size-full" aria-hidden="true">
        <rect width="40" height="40" fill="#cfe3fb"/><circle cx="28" cy="13" r="5" fill="#fde68a"/>
        <path d="M0 29 L11 18 L18 25 L26 16 L40 28 V40 H0Z" fill="#9fd9b0"/>
        <path d="M0 33 C8 29 16 31 22 33 S34 30 40 32 V40 H0Z" fill="#5fbf7f"/>
      </svg>
    </span>`;

  const HILLS = `
    <svg viewBox="0 0 240 120" class="block w-full shrink-0 [@media(max-height:700px)]:hidden" aria-hidden="true">
      <path d="M0 58 C28 44 52 42 80 52 S138 36 172 46 S222 40 240 44 V120 H0Z" fill="#dde9e1"/>
      <path d="M0 76 C36 62 70 66 104 74 S172 58 240 70 V120 H0Z" fill="#c3dccb"/>
      <path d="M0 94 C46 82 88 88 126 94 S198 82 240 88 V120 H0Z" fill="#a6cbb1"/>
      <g fill="#6f9f7e">
        <path d="M22 62 l-9 18 h5 l-8 16 h24 l-8 -16 h5 z"/>
        <path d="M42 70 l-7 14 h4 l-6 12 h18 l-6 -12 h4 z"/>
        <path d="M8 74 l-6 12 h3 l-5 10 h16 l-5 -10 h3 z"/>
        <path d="M200 72 l-7 14 h4 l-6 12 h18 l-6 -12 h4 z"/>
        <path d="M220 64 l-9 18 h5 l-8 16 h24 l-8 -16 h5 z"/>
      </g>
      <path d="M0 104 C60 96 120 102 170 104 S220 98 240 100 V120 H0Z" fill="#8fbc9b"/>
    </svg>`;

  function sidebarHTML(page) {
    const link = (n) => `
      <li><a href="${n.href}" class="nav-link"${n.id === page ? ' aria-current="page"' : ''}>
        <i data-lucide="${n.icon}" class="size-5 shrink-0"></i><span>${n.label}</span>
      </a></li>`;
    return `
    <aside id="sidebar" class="fixed inset-y-0 left-0 z-40 flex w-60 -translate-x-full flex-col overflow-hidden border-r border-slate-200/70 bg-[#f2f5f9] transition-transform duration-300 lg:translate-x-0" aria-label="Main navigation">
      <div class="flex h-18 shrink-0 items-center gap-3 px-5">
        <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-600"><i data-lucide="sprout" class="size-6"></i></span>
        <a href="index.html" class="min-w-0 leading-tight">
          <span class="block text-[15px] font-bold text-slate-900">Nurullah POS</span>
          <span class="block text-xs text-slate-500">Live well. Plan better.</span>
        </a>
        <button type="button" class="btn btn-ghost btn-icon btn-sm ml-auto lg:hidden" data-sidebar-close aria-label="Close menu"><i data-lucide="x" class="size-5"></i></button>
      </div>
      <nav class="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-2">
        <ul class="space-y-1">${NAV.map(link).join('')}</ul>
        <div class="mx-3 my-3 border-t border-slate-200/80"></div>
        <ul>${link(SETTINGS)}</ul>
      </nav>
      <div class="shrink-0 px-4 [@media(max-height:820px)]:hidden">
        <figure class="rounded-2xl bg-white/70 px-4 py-4 text-center ring-1 ring-slate-200/60">
          <i data-lucide="sprout" class="mx-auto size-5 text-emerald-500"></i>
          <blockquote class="mt-2 text-[13px] leading-relaxed text-slate-600">“A better life is a series of small, intentional choices.”</blockquote>
        </figure>
      </div>
      ${HILLS}
    </aside>
    <div id="sidebar-overlay" class="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" hidden></div>`;
  }

  function notificationsHTML() {
    const items = [
      ['receipt', 'bg-rose-50 text-rose-600', 'Electricity bill is overdue', 'Finance · due yesterday'],
      ['graduation-cap', 'bg-indigo-50 text-indigo-600', 'IQA Unit 1.4 is planned this week', 'Learning · 3h estimated'],
      ['glass-water', 'bg-sky-50 text-sky-600', '21-day streak: Drink Water', 'Habits · keep it going'],
      ['calendar-clock', 'bg-amber-50 text-amber-600', 'Dentist appointment in 3 days', 'Calendar · 10:30 AM'],
    ];
    return `
    <div class="relative" data-dropdown>
      <button type="button" data-dropdown-trigger aria-expanded="false" aria-label="Notifications" class="btn btn-ghost btn-icon relative">
        <i data-lucide="bell" class="size-5"></i>
        <span id="notif-dot" class="absolute right-2.5 top-2.5 size-2 rounded-full bg-rose-500 ring-2 ring-white"></span>
      </button>
      <div data-dropdown-menu hidden class="absolute right-0 top-full z-30 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl max-sm:fixed max-sm:inset-x-4 max-sm:top-16 max-sm:w-auto">
        <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <p class="text-sm font-semibold text-slate-900">Notifications</p>
          <button type="button" data-notif-read class="text-xs font-medium text-blue-600 hover:text-blue-700">Mark all as read</button>
        </div>
        <ul class="max-h-80 divide-y divide-slate-100 overflow-y-auto">
          ${items.map(([icon, tone, title, meta]) => `
          <li class="flex gap-3 px-4 py-3 hover:bg-slate-50">
            <span class="icon-tile size-8 ${tone}"><i data-lucide="${icon}" class="size-4"></i></span>
            <div class="min-w-0"><p class="text-sm font-medium text-slate-800">${title}</p><p class="text-xs text-slate-500">${meta}</p></div>
          </li>`).join('')}
        </ul>
      </div>
    </div>`;
  }

  function profileHTML() {
    const item = 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50';
    return `
    <div class="relative" data-dropdown>
      <button type="button" data-dropdown-trigger aria-expanded="false" aria-label="Account menu" class="flex items-center gap-3 rounded-xl p-1 transition hover:bg-slate-100 sm:pr-2">
        ${avatar('size-10')}
        <span class="hidden text-left leading-tight xl:block">
          <span class="block text-sm font-semibold text-slate-800">A Better You</span>
          <span class="block text-xs text-slate-500">Every Day</span>
        </span>
        <i data-lucide="chevron-down" class="hidden size-4 text-slate-500 sm:block"></i>
      </button>
      <div data-dropdown-menu hidden class="absolute right-0 top-full z-30 mt-2 w-60 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
        <div class="flex items-center gap-3 px-3 py-2.5">
          ${avatar('size-9')}
          <div class="leading-tight"><p class="text-sm font-semibold text-slate-900">Nurullah</p><p class="text-xs text-slate-500">pos.nurullah.com.bd</p></div>
        </div>
        <div class="my-1 border-t border-slate-100"></div>
        <a href="settings.html#profile" class="${item}"><i data-lucide="user" class="size-4 text-slate-500"></i>My profile</a>
        <a href="settings.html" class="${item}"><i data-lucide="settings" class="size-4 text-slate-500"></i>Settings</a>
        <button type="button" data-signout class="${item} text-rose-600 hover:bg-rose-50"><i data-lucide="log-out" class="size-4"></i>Sign out</button>
      </div>
    </div>`;
  }

  function topbarHTML(page) {
    const label = ([...NAV, SETTINGS].find((n) => n.id === page) || NAV[0]).label;
    const key = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘K' : 'Ctrl K';
    return `
    <header class="sticky top-0 z-20 border-b border-slate-200/70 bg-white/90 backdrop-blur">
      <div class="flex h-16 items-center gap-2 px-4 sm:h-18 sm:gap-3 sm:px-6 xl:px-8">
        <button type="button" class="btn btn-ghost btn-icon -ml-2 lg:hidden" data-sidebar-open aria-label="Open menu"><i data-lucide="menu" class="size-5"></i></button>
        <a href="index.html" class="flex min-w-0 items-center gap-3">
          <i data-lucide="leaf" class="hidden size-8 shrink-0 fill-emerald-100 text-emerald-600 sm:block"></i>
          <span class="min-w-0">
            <span class="block truncate text-lg font-bold tracking-tight text-slate-900 sm:hidden">${label}</span>
            <span class="hidden truncate text-xl font-bold tracking-tight text-slate-900 sm:block">Personal Life Management System</span>
            <span class="hidden truncate text-sm text-slate-500 md:block">A more intentional you, every day.</span>
          </span>
        </a>
        <div class="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <button type="button" data-command-open class="mr-1 hidden h-11 w-60 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-left text-sm text-slate-400 transition hover:border-slate-300 hover:bg-white lg:flex xl:w-80 2xl:w-96">
            <i data-lucide="search" class="size-4.5 shrink-0 text-slate-500"></i>
            <span class="flex-1 truncate">Search anything… (tasks, notes, goals, etc.)</span>
            <kbd class="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-sans text-[11px] font-medium text-slate-500">${key}</kbd>
          </button>
          <button type="button" data-command-open class="btn btn-ghost btn-icon lg:hidden" aria-label="Search"><i data-lucide="search" class="size-5"></i></button>
          ${notificationsHTML()}
          <span class="mx-1 hidden h-8 w-px bg-slate-200 sm:block"></span>
          ${profileHTML()}
        </div>
      </div>
    </header>`;
  }

  const COMMAND_HTML = `
    <dialog id="command-palette" aria-label="Search" class="mb-auto mt-[10vh] w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl">
      <div class="flex items-center gap-3 border-b border-slate-100 px-4">
        <i data-lucide="search" class="size-5 shrink-0 text-slate-400"></i>
        <input id="command-input" type="text" autocomplete="off" spellcheck="false" placeholder="Search pages, actions, tasks, notes…" class="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-slate-800 outline-none placeholder:text-slate-400">
        <kbd class="rounded-md border border-slate-200 px-1.5 py-0.5 font-sans text-[11px] text-slate-500">Esc</kbd>
      </div>
      <ul id="command-list" role="listbox" class="max-h-[55vh] overflow-y-auto p-2"></ul>
      <div class="flex items-center gap-5 border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
        <span><kbd class="font-sans font-semibold">↑ ↓</kbd> move</span>
        <span><kbd class="font-sans font-semibold">Enter</kbd> open</span>
        <span class="ml-auto">Sample search — no database yet</span>
      </div>
    </dialog>
    <div id="toasts" class="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-2"></div>`;

  function renderLayout() {
    const page = document.body.dataset.page;
    const sidebarRoot = $('#sidebar-root');
    const topbarRoot = $('#topbar-root');
    if (sidebarRoot) sidebarRoot.outerHTML = sidebarHTML(page);
    if (topbarRoot) topbarRoot.outerHTML = topbarHTML(page);
    document.body.insertAdjacentHTML('beforeend', COMMAND_HTML);
  }

  function setSidebar(open) {
    const sidebar = $('#sidebar');
    if (!sidebar) return;
    sidebar.classList.toggle('-translate-x-full', !open);
    $('#sidebar-overlay').hidden = !open;
  }

  function closeDropdowns(except) {
    $$('[data-dropdown]').forEach((dd) => {
      if (dd === except) return;
      const menu = $('[data-dropdown-menu]', dd);
      if (menu) menu.hidden = true;
      $('[data-dropdown-trigger]', dd)?.setAttribute('aria-expanded', 'false');
    });
  }

  /* ================= Command palette (Ctrl+K) ================= */
  let cmdItems = [];
  let cmdIndex = 0;

  function renderCommands() {
    const q = $('#command-input').value.trim().toLowerCase();
    cmdItems = COMMANDS.filter((c) => (q ? `${c.label} ${c.hint || ''} ${c.group}`.toLowerCase().includes(q) : !c.searchOnly));
    cmdIndex = Math.min(cmdIndex, Math.max(cmdItems.length - 1, 0));
    const list = $('#command-list');
    if (!cmdItems.length) {
      list.innerHTML = `<li class="px-3 py-10 text-center text-sm text-slate-500">No results for “${escapeHTML(q)}”</li>`;
      return;
    }
    let group = '';
    list.innerHTML = cmdItems
      .map((c, i) => {
        const heading = c.group !== group ? `<li class="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">${(group = c.group)}</li>` : '';
        return `${heading}
        <li role="option" aria-selected="${i === cmdIndex}" data-index="${i}" class="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-700 aria-selected:bg-blue-50 aria-selected:text-blue-700">
          <i data-lucide="${c.icon}" class="size-4.5 shrink-0 text-slate-400"></i>
          <span class="flex-1 truncate">${c.label}</span>
          ${c.hint ? `<span class="text-xs text-slate-400">${c.hint}</span>` : ''}
        </li>`;
      })
      .join('');
    icons(list);
    $('[aria-selected="true"]', list)?.scrollIntoView({ block: 'nearest' });
  }

  function openCommands() {
    const input = $('#command-input');
    input.value = '';
    cmdIndex = 0;
    renderCommands();
    openModal('command-palette');
    input.focus();
  }

  function runCommand(item) {
    if (!item) return;
    closeModal('command-palette');
    window.location.href = item.href;
  }

  // "#new" in the address (e.g. tasks.html#new) opens that page's main "New …" window.
  function openNewFromHash() {
    if (window.location.hash !== '#new') return;
    try {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    } catch {
      /* some browsers block this on file:// — harmless */
    }
    const dlg = $('dialog[data-new-modal]');
    if (dlg) openModal(dlg.id);
  }

  /* ================= Global events ================= */
  let pressTarget = null;
  document.addEventListener('mousedown', (e) => { pressTarget = e.target; });

  document.addEventListener('click', (e) => {
    const t = e.target;

    // Modals
    const opener = t.closest('[data-modal-open]');
    if (opener) { e.preventDefault(); openModal(opener.dataset.modalOpen); return; }
    const closer = t.closest('[data-modal-close]');
    if (closer) { e.preventDefault(); closeModal(closer.closest('dialog')); return; }
    if (t.tagName === 'DIALOG' && pressTarget === t) { closeModal(t); return; } // click on the dark backdrop

    // Sidebar (mobile)
    if (t.closest('[data-sidebar-open]')) { setSidebar(true); return; }
    if (t.closest('[data-sidebar-close]') || t.id === 'sidebar-overlay') { setSidebar(false); return; }

    // Search
    if (t.closest('[data-command-open]')) { openCommands(); return; }
    const option = t.closest('#command-list [role="option"]');
    if (option) { runCommand(cmdItems[Number(option.dataset.index)]); return; }

    // Tabs: <div data-tabs> <button role="tab" data-tab="x"> ... Panels: [data-tab-panel="x"] inside #id from data-tabs="id"
    const tab = t.closest('[data-tabs] > [role="tab"]');
    if (tab) {
      const group = tab.parentElement;
      $$(':scope > [role="tab"]', group).forEach((b) => b.setAttribute('aria-selected', String(b === tab)));
      const scope = group.dataset.tabs && document.getElementById(group.dataset.tabs);
      if (scope) $$('[data-tab-panel]', scope).forEach((p) => { p.hidden = p.dataset.tabPanel !== tab.dataset.tab; });
      group.dispatchEvent(new CustomEvent('tabchange', { detail: tab.dataset.tab, bubbles: true }));
    }

    // Switches
    const sw = t.closest('.switch');
    if (sw) sw.setAttribute('aria-checked', String(sw.getAttribute('aria-checked') !== 'true'));

    // Dropdowns
    const trigger = t.closest('[data-dropdown-trigger]');
    const dropdown = t.closest('[data-dropdown]');
    if (trigger) {
      const menu = $('[data-dropdown-menu]', dropdown);
      const willOpen = menu.hidden;
      closeDropdowns(dropdown);
      menu.hidden = !willOpen;
      trigger.setAttribute('aria-expanded', String(willOpen));
    } else if (!dropdown) {
      closeDropdowns();
    }

    // Header extras
    if (t.closest('[data-notif-read]')) {
      $('#notif-dot')?.remove();
      closeDropdowns();
      toast('All notifications marked as read');
    }
    if (t.closest('[data-signout]')) {
      closeDropdowns();
      toast('Sign-out will work once login is added', { icon: 'info', tone: 'text-blue-600' });
    }
  });

  document.addEventListener('mousemove', (e) => {
    const option = e.target.closest('#command-list [role="option"]');
    if (option && Number(option.dataset.index) !== cmdIndex) {
      cmdIndex = Number(option.dataset.index);
      $$('#command-list [role="option"]').forEach((o) => o.setAttribute('aria-selected', String(o === option)));
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'command-input') { cmdIndex = 0; renderCommands(); }
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if ($('#command-palette').open) closeModal('command-palette');
      else openCommands();
      return;
    }
    if (e.target.id === 'command-input') {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        cmdIndex = (cmdIndex + step + cmdItems.length) % Math.max(cmdItems.length, 1);
        renderCommands();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        runCommand(cmdItems[cmdIndex]);
      }
    }
    if (e.key === 'Escape') { closeDropdowns(); setSidebar(false); }
  });

  // Also reset when a dialog is closed with the Esc key.
  document.addEventListener('close', (e) => {
    if (e.target.tagName === 'DIALOG') e.target.querySelector('form')?.reset();
  }, true);

  window.addEventListener('hashchange', openNewFromHash);

  /* ================= Start ================= */
  renderLayout();

  document.addEventListener('DOMContentLoaded', () => {
    fillDates();
    icons();
    openNewFromHash();
  });

  // Show the page as soon as Tailwind has styled it (see app.css), instead of waiting for
  // every font and script to download. The sidebar turning "position: fixed" is the signal.
  const revealStart = performance.now();
  (function reveal() {
    const sidebar = $('#sidebar');
    const styled = !sidebar || getComputedStyle(sidebar).position === 'fixed';
    if (styled || performance.now() - revealStart > 2500) {
      requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add('is-ready')));
    } else {
      requestAnimationFrame(reveal);
    }
  })();

  window.POS = {
    $, $$, escapeHTML,
    today, addDays, daysBetween, fmt, isoDate, relativeDay, fillDates, greeting, minutesOf, time12,
    money, pct, num, hm,
    icons, donut, toast, openModal, closeModal,
  };
})();
