// The model in words: the multiple is the median mcap/TVL of the snapshot's live-token protocols.
// A category median is used when that category has at least 3 live-token samples; otherwise the
// overall median carries the row. Implied value multiplies TVL by that multiple, a clamped seven-day
// growth factor, and an age maturity factor. This page only reads the local data.js and never fetches.
(() => {
  'use strict';

  const app = document.getElementById('app');
  const data = window.RADAR;
  const DEFAULT_SORT = 'rank-asc';
  const MIN_CATEGORY_SAMPLES = 3;

  /** A small element helper: text goes in through textContent, never through innerHTML. */
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function add(parent, ...children) {
    for (const child of children) if (child !== null && child !== undefined) parent.append(child);
    return parent;
  }

  function fmtUsd(value, full = false) {
    if (!Number.isFinite(value)) return 'n/a';
    if (full) return `$${Math.round(value).toLocaleString('en-US')}`;
    const abs = Math.abs(value);
    if (abs >= 1e12) return `$${Number((value / 1e12).toFixed(2))}T`;
    if (abs >= 1e9) return `$${Number((value / 1e9).toFixed(2))}B`;
    if (abs >= 1e6) return `$${Number((value / 1e6).toFixed(1))}M`;
    if (abs >= 1e3) return `$${Number((value / 1e3).toFixed(1))}K`;
    return `$${Math.round(value)}`;
  }

  function fmtX(value) {
    if (!Number.isFinite(value)) return 'n/a';
    return `${Number(value.toFixed(2))}x`;
  }

  function fmtPct(value) {
    if (value === null || !Number.isFinite(value)) return 'n/a';
    const shown = Math.abs(value) < 0.05 ? 0 : value;
    return `${shown > 0 ? '+' : ''}${shown.toFixed(1)}%`;
  }

  function fmtAge(value) {
    if (value === null || !Number.isFinite(value)) return 'unknown';
    return `${Math.round(value)} days`;
  }

  function fmtDate(value) {
    return value === null || value === undefined || value === '' ? 'unknown' : value;
  }

  function chainText(chains, limit = 3) {
    if (!Array.isArray(chains) || chains.length === 0) return 'No chain listed';
    const shown = chains.slice(0, limit).join(' / ');
    return chains.length > limit ? `${shown} +${chains.length - limit}` : shown;
  }

  function categoryText(row) {
    return row.category === null || row.category === '' ? 'Uncategorized' : row.category;
  }

  function parseHash() {
    const raw = location.hash.replace(/^#/, '');
    const params = new URLSearchParams(raw);
    const sort = params.get('sort');
    return {
      q: params.get('q') ?? '',
      category: params.get('category') ?? '',
      sort: normalizeSort(sort),
      slug: params.get('p') ?? '',
    };
  }

  const SORT_VALUES = new Set([
    'rank-asc',
    'rank-desc',
    'name-asc',
    'name-desc',
    'category-asc',
    'category-desc',
    'tvl-asc',
    'tvl-desc',
    'change-asc',
    'change-desc',
    'implied-asc',
    'implied-desc',
  ]);

  function normalizeSort(value) {
    return value && SORT_VALUES.has(value) ? value : DEFAULT_SORT;
  }

  function filterHash(state) {
    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category) params.set('category', state.category);
    if (state.sort && state.sort !== DEFAULT_SORT) params.set('sort', state.sort);
    return params.toString();
  }

  function syncHash(state) {
    const next = filterHash(state);
    try {
      history.replaceState(null, '', `${location.pathname}${location.search}${next ? `#${next}` : ''}`);
    } catch {
      // A file:// page can refuse replaceState; the in-memory filters still work.
    }
  }

  function goDetail(state, slug) {
    const params = new URLSearchParams(filterHash(state));
    params.set('p', slug);
    location.hash = params.toString();
  }

  function verifyRows(rows) {
    const mismatches = [];
    for (const row of rows) {
      const expected = Math.max(
        1,
        Math.round(row.tvl_usd * row.multiple * row.growth_multiplier * row.maturity_multiplier),
      );
      if (expected !== row.implied_value_usd) {
        mismatches.push({ slug: row.slug, expected, actual: row.implied_value_usd });
      }
    }
    if (mismatches.length > 0) {
      console.warn(`token radar: ${mismatches.length} of ${rows.length} implied values do not match their factors`, mismatches.slice(0, 8));
    } else {
      console.info(`token radar: verified all ${rows.length} implied values against tvl_usd x multiple x growth x maturity`);
    }
  }

  function renderMissing(message) {
    app.replaceChildren();
    const panel = el('section', 'panel missing-panel');
    add(panel, el('p', 'eyebrow', 'Token Radar'), el('h1', 'missing-title', 'The page has no radar data'));
    add(panel, el('p', 'missing-copy', message));
    add(panel, el('p', 'missing-copy muted', 'The dashboard reads ../data.js, which main.ts writes beside dashboard/ in the output directory. Rebuild and reload.'));
    app.append(panel);
  }

  function masthead() {
    const header = el('header', 'masthead');
    const brand = el('div', 'brand');
    const mark = el('div', 'brand-mark', 'TR');
    const words = el('div', 'brand-words');
    add(words, el('div', 'brand-name', 'TOKEN RADAR'), el('div', 'brand-sub', 'make.fun / token-radar-01'));
    add(brand, mark, words);

    const meta = el('div', 'masthead-meta');
    const date = el('div', 'meta-block');
    add(date, el('span', 'meta-label', 'Snapshot'), el('span', 'meta-value mono', data.as_of));
    const model = el('div', 'meta-block');
    add(model, el('span', 'meta-label', 'Model'), el('span', 'meta-value mono', data.model_version));
    add(meta, date, model);
    add(header, brand, meta);
    return header;
  }

  function footer() {
    const foot = el('footer', 'footer');
    const promise = el('p', 'footer-promise', 'Implied value is a model, not a promise.');
    const meta = el('p', 'footer-meta');
    add(meta, el('span', null, `Snapshot ${data.as_of}`), el('span', 'footer-sep', '/'), el('span', null, data.source));
    const rule = el('p', 'footer-rule', 'The board ranks pre-token protocols only. Live-token protocols are the benchmark and are never ranked against them.');
    add(foot, promise, meta, rule);
    return foot;
  }

  function stat(label, value, note, accent = false) {
    const cell = el('div', 'stat');
    add(cell, el('div', 'stat-label', label), el('div', `stat-value mono${accent ? ' accent' : ''}`, value));
    if (note) add(cell, el('div', 'stat-note', note));
    return cell;
  }

  function stats() {
    const multiples = data.multiples;
    const row = el('section', 'stats');
    row.setAttribute('aria-label', 'Snapshot summary');
    add(
      row,
      stat('Protocols', String(data.protocol_count)),
      stat('Watchlist covered', String(data.watchlist_size)),
      stat('Ranked rows', String(data.board_size)),
      stat('Median multiple', fmtX(multiples.overall_median), null, true),
      stat('Live samples', String(multiples.overall_samples)),
    );
    return row;
  }

  function hero() {
    const section = el('section', 'hero');
    const title = el('h1', 'hero-title');
    add(title, document.createTextNode('The protocols that have '), el('span', 'accent', 'not shipped a token yet.'));
    add(
      section,
      title,
      el(
        'p',
        'hero-lede',
        'The watchlist is the floor; the early radar adds pre-token protocols below it. Implied value is a model, not a promise.',
      ),
    );
    return section;
  }

  function filterChip(label, onRemove) {
    const chip = el('span', 'filter-chip');
    add(chip, el('span', 'filter-chip-text', label));
    const remove = el('button', 'chip-remove', '\u00d7');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove ${label}`);
    remove.addEventListener('click', onRemove);
    add(chip, remove);
    return chip;
  }

  function compareRows(a, b, key, direction) {
    if (key === 'change') {
      const av = a.change_7d;
      const bv = b.change_7d;
      if (av === null && bv === null) return a.rank - b.rank;
      if (av === null) return 1;
      if (bv === null) return -1;
      const diff = av - bv;
      return diff === 0 ? a.rank - b.rank : direction === 'asc' ? diff : -diff;
    }
    let av;
    let bv;
    if (key === 'rank') {
      av = a.rank;
      bv = b.rank;
    } else if (key === 'name') {
      av = a.name.toLowerCase();
      bv = b.name.toLowerCase();
    } else if (key === 'category') {
      av = categoryText(a).toLowerCase();
      bv = categoryText(b).toLowerCase();
    } else if (key === 'tvl') {
      av = a.tvl_usd;
      bv = b.tvl_usd;
    } else {
      av = a.implied_value_usd;
      bv = b.implied_value_usd;
    }
    let diff;
    if (typeof av === 'string' && typeof bv === 'string') diff = av.localeCompare(bv);
    else diff = Number(av) - Number(bv);
    if (diff === 0) return a.rank - b.rank;
    return direction === 'asc' ? diff : -diff;
  }

  function visibleRows(state) {
    const query = state.q.trim().toLowerCase();
    const filtered = data.rows.filter((row) => {
      if (state.category && row.category !== state.category) return false;
      if (!query) return true;
      const haystack = [row.name, row.slug, row.category ?? '', ...(row.chains ?? [])].join(' ').toLowerCase();
      return haystack.includes(query);
    });
    const [key, direction] = state.sort.split('-');
    return filtered.sort((a, b) => compareRows(a, b, key, direction));
  }

  const HEADERS = [
    { key: 'rank', label: 'Rank', className: 'col-rank' },
    { key: 'name', label: 'Protocol', className: 'col-protocol' },
    { key: 'category', label: 'Category', className: 'col-category' },
    { key: 'tvl', label: 'TVL', className: 'col-number' },
    { key: 'change', label: '7d change', className: 'col-number' },
    { key: 'implied', label: 'Implied value', className: 'col-implied' },
  ];

  const DEFAULT_DIRECTION = {
    rank: 'asc',
    name: 'asc',
    category: 'asc',
    tvl: 'desc',
    change: 'desc',
    implied: 'desc',
  };

  function renderHome(state) {
    document.title = 'Token Radar | make.fun';
    const shell = el('div', 'shell');
    add(shell, masthead(), hero(), stats());

    const layout = el('div', 'layout');
    const boardPanel = el('section', 'panel board-panel');
    boardPanel.id = 'board';

    const head = el('div', 'panel-head board-head');
    const headText = el('div', 'panel-head-text');
    add(headText, el('p', 'eyebrow', 'Ranked board'), el('h2', 'panel-title', 'Pre-token, by implied value'));
    const countBadge = el('span', 'count-badge', `${data.board_size} rows`);
    add(head, headText, countBadge);

    const toolbar = el('div', 'toolbar');
    const searchLabel = el('label', 'control control-search');
    const search = el('input', 'search-input');
    search.type = 'search';
    search.id = 'board-search';
    search.placeholder = 'Search name, slug, category or chain';
    search.value = state.q;
    search.setAttribute('autocomplete', 'off');
    add(searchLabel, el('span', 'control-label', 'Search'), search);

    const categoryLabel = el('label', 'control control-select');
    const category = el('select', 'select-input');
    category.id = 'board-category';
    const categories = [...new Set(data.rows.map((row) => row.category).filter((value) => value !== null && value !== ''))].sort((a, b) =>
      a.localeCompare(b),
    );
    if (state.category && !categories.includes(state.category)) categories.push(state.category);
    add(category, new Option('All categories', ''));
    for (const value of categories) add(category, new Option(value, value));
    category.value = state.category;
    add(categoryLabel, el('span', 'control-label', 'Category'), category);

    const sortLabel = el('label', 'control control-select');
    const sort = el('select', 'select-input');
    sort.id = 'board-sort';
    const sortOptions = [
      ['rank-asc', 'Board rank'],
      ['rank-desc', 'Board rank, reversed'],
      ['implied-desc', 'Implied value, high to low'],
      ['implied-asc', 'Implied value, low to high'],
      ['tvl-desc', 'TVL, high to low'],
      ['tvl-asc', 'TVL, low to high'],
      ['change-desc', '7d change, high to low'],
      ['change-asc', '7d change, low to high'],
      ['name-asc', 'Name, A to Z'],
      ['name-desc', 'Name, Z to A'],
      ['category-asc', 'Category, A to Z'],
      ['category-desc', 'Category, Z to A'],
    ];
    for (const [value, label] of sortOptions) add(sort, new Option(label, value));
    sort.value = state.sort;
    add(sortLabel, el('span', 'control-label', 'Sort'), sort);
    add(toolbar, searchLabel, categoryLabel, sortLabel);

    const filterBar = el('div', 'filter-bar');
    const chips = el('div', 'chips');
    const resultCount = el('span', 'result-count');
    add(filterBar, chips, resultCount);

    const tableWrap = el('div', 'table-scroll');
    const table = el('table', 'board-table');
    const thead = el('thead');
    const headRow = el('tr');
    const headerRefs = [];
    for (const column of HEADERS) {
      const th = el('th', column.className);
      th.scope = 'col';
      const button = el('button', 'sort-button', column.label);
      button.type = 'button';
      button.setAttribute('aria-label', `Sort by ${column.label}`);
      const mark = el('span', 'sort-mark');
      button.append(mark);
      button.addEventListener('click', () => {
        const [activeKey, activeDirection] = state.sort.split('-');
        const direction = activeKey === column.key ? (activeDirection === 'asc' ? 'desc' : 'asc') : DEFAULT_DIRECTION[column.key];
        state.sort = `${column.key}-${direction}`;
        sort.value = state.sort;
        syncHash(state);
        updateBoard();
      });
      th.append(button);
      headRow.append(th);
      headerRefs.push({ th, mark, key: column.key });
    }
    thead.append(headRow);
    const tbody = el('tbody');
    add(table, thead, tbody);
    tableWrap.append(table);

    const empty = el('div', 'empty-state');
    empty.hidden = true;
    const emptyTitle = el('p', 'empty-title', 'No protocols match this filter.');
    const emptyCopy = el('p', 'empty-copy', 'Clear the search and category to see the full ranked board.');
    const emptyButton = el('button', 'button-accent', 'Clear filters');
    emptyButton.type = 'button';
    add(empty, emptyTitle, emptyCopy, emptyButton);

    add(boardPanel, head, toolbar, filterBar, tableWrap, empty);

    const rail = el('aside', 'rail');
    add(rail, modelPanel(), livePanel());

    add(layout, boardPanel, rail);
    add(shell, layout, footer());
    app.replaceChildren(shell);

    function updateBoard() {
      const rows = visibleRows(state);
      const maxImplied = rows.reduce((max, row) => Math.max(max, row.implied_value_usd), 0);
      tbody.replaceChildren();
      for (const row of rows) tbody.append(boardRow(row, maxImplied, state));

      tableWrap.hidden = rows.length === 0;
      empty.hidden = rows.length > 0;
      countBadge.textContent = `${data.board_size} rows`;
      resultCount.textContent = `Showing ${rows.length} of ${data.rows.length}`;

      chips.replaceChildren();
      if (!state.q && !state.category) {
        chips.append(el('span', 'filter-idle', 'No filter'));
      } else {
        if (state.q) {
          chips.append(
            filterChip(`Search: ${state.q}`, () => {
              state.q = '';
              search.value = '';
              syncHash(state);
              updateBoard();
            }),
          );
        }
        if (state.category) {
          chips.append(
            filterChip(`Category: ${state.category}`, () => {
              state.category = '';
              category.value = '';
              syncHash(state);
              updateBoard();
            }),
          );
        }
      }

      const [activeKey, activeDirection] = state.sort.split('-');
      for (const ref of headerRefs) {
        const active = ref.key === activeKey;
        ref.th.setAttribute('aria-sort', active ? (activeDirection === 'asc' ? 'ascending' : 'descending') : 'none');
        ref.mark.textContent = active ? (activeDirection === 'asc' ? '\u2191' : '\u2193') : '';
      }
    }

    search.addEventListener('input', () => {
      state.q = search.value;
      syncHash(state);
      updateBoard();
    });
    category.addEventListener('change', () => {
      state.category = category.value;
      syncHash(state);
      updateBoard();
    });
    sort.addEventListener('change', () => {
      state.sort = normalizeSort(sort.value);
      syncHash(state);
      updateBoard();
    });
    emptyButton.addEventListener('click', () => {
      state.q = '';
      state.category = '';
      search.value = '';
      category.value = '';
      syncHash(state);
      updateBoard();
      search.focus();
    });

    updateBoard();
  }

  function boardRow(row, maxImplied, state) {
    const tr = el('tr', 'board-row');
    tr.tabIndex = 0;
    tr.setAttribute('role', 'link');
    tr.setAttribute('aria-label', `Open ${row.name}, rank ${row.rank}`);
    const open = () => goDetail(state, row.slug);
    tr.addEventListener('click', open);
    tr.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });

    const rank = el('td', 'col-rank');
    add(rank, el('span', `rank mono${row.rank <= 3 ? ' rank-top' : ''}`, String(row.rank)));

    const protocol = el('td', 'col-protocol');
    const nameLine = el('div', 'protocol-name', row.name);
    const chainLine = el('div', 'protocol-chains', chainText(row.chains));
    const farmLine = el('div', 'protocol-farm', row.farm_hint);
    add(protocol, nameLine, chainLine, farmLine);

    const category = el('td', 'col-category');
    add(category, el('span', 'chip', categoryText(row)));

    const tvl = el('td', 'col-number');
    add(tvl, el('span', 'mono', fmtUsd(row.tvl_usd)));

    const change = el('td', 'col-number');
    const negative = row.change_7d !== null && row.change_7d < 0;
    add(change, el('span', `mono change${negative ? ' negative' : ''}`, fmtPct(row.change_7d)));

    const implied = el('td', 'col-implied');
    const value = el('div', 'value-cell');
    const valueLine = el('div', 'value-line');
    add(valueLine, el('span', 'mono value-number', fmtUsd(row.implied_value_usd)));
    const bar = el('span', 'value-bar');
    const width = maxImplied > 0 ? (row.implied_value_usd / maxImplied) * 100 : 0;
    bar.style.width = `${width}%`;
    add(value, valueLine, bar);
    implied.append(value);

    add(tr, rank, protocol, category, tvl, change, implied);
    return tr;
  }

  function modelPanel() {
    const panel = el('section', 'panel model-panel');
    const multiples = data.multiples;
    add(panel, el('p', 'eyebrow', 'The multiple'));

    const median = el('div', 'median-value mono', fmtX(multiples.overall_median));
    add(panel, median);
    add(
      panel,
      el('p', 'median-note', `median mcap / TVL from ${multiples.overall_samples} live-token protocols`),
    );

    const regular = Object.keys(multiples.categories).length;
    const rule = el('p', 'model-rule');
    add(
      rule,
      document.createTextNode(
        `A category median is used only when that category has at least ${data.model.min_category_samples} live-token samples; otherwise the overall median carries the row. ${regular} categories qualify.`,
      ),
    );
    add(panel, rule);

    const code = el('pre', 'formula');
    code.textContent = [
      'implied = max(1, round(',
      '  tvl_usd',
      '  x multiple',
      '  x (1 + clamp(change_7d, -60, 120) / 100 x 0.5)',
      '  x (0.6 + min(age, 1095) / 1095 x 0.4)',
      '))',
    ].join('\n');
    add(panel, code);

    const clampRow = el('div', 'clamp-row');
    add(clampRow, el('span', 'clamp-label', 'Ratio clamp'), el('span', 'mono clamp-value', '0.05x to 5x'));
    add(panel, clampRow);
    return panel;
  }

  function livePanel() {
    const panel = el('section', 'panel live-panel');
    add(panel, el('p', 'eyebrow', 'Already trading'), el('h2', 'panel-title', 'Live-token benchmarks'));
    add(
      panel,
      el('p', 'panel-copy', `The top ${Math.min(6, data.live.length)} by market cap. Their mcap / TVL sets the multiple; they are never ranked against pre-token protocols. Ratios are shown raw; the model clamps them to 0.05x to 5x.`),
    );
    const list = el('ol', 'live-list');
    for (const item of data.live.slice(0, 6)) {
      const li = el('li', 'live-item');
      const main = el('div', 'live-main');
      add(main, el('div', 'live-name', item.name), el('div', 'live-category', categoryText(item)));
      const numbers = el('div', 'live-numbers');
      const change = el('div', `mono live-change${item.change_7d !== null && item.change_7d < 0 ? ' negative' : ''}`, fmtPct(item.change_7d));
      add(numbers, el('div', 'mono live-ratio', fmtX(item.ratio)), change);
      add(li, main, numbers);
      list.append(li);
    }
    add(panel, list);
    return panel;
  }

  function equationFactor(label, value, sub, accent = false) {
    const factor = el('div', `factor${accent ? ' factor-result' : ''}`);
    add(factor, el('div', 'factor-label', label), el('div', 'factor-value mono', value), el('div', 'factor-sub', sub));
    return factor;
  }

  function equationOperator(symbol) {
    return el('div', 'equation-op mono', symbol);
  }

  function multipleSource(row) {
    if (row.multiple_source === 'category') {
      return `Category median from ${row.multiple_samples} samples`;
    }
    if (row.category_samples > 0 && row.category_samples < MIN_CATEGORY_SAMPLES) {
      return `Overall median from ${row.multiple_samples} samples; category has ${row.category_samples}`;
    }
    return `Overall median from ${row.multiple_samples} samples`;
  }

  function metric(label, value, sub) {
    const cell = el('div', 'metric');
    add(cell, el('div', 'metric-label', label), el('div', 'metric-value mono', value));
    if (sub) add(cell, el('div', 'metric-sub', sub));
    return cell;
  }

  function renderDetail(state) {
    const row = data.rows.find((item) => item.slug === state.slug);
    document.title = row ? `${row.name} | Token Radar` : 'Protocol not found | Token Radar';
    if (!row) {
      const shell = el('div', 'shell');
      add(shell, masthead());
      const panel = el('section', 'panel missing-panel');
      add(panel, el('p', 'eyebrow', 'Detail view'), el('h1', 'missing-title', 'No protocol with that slug'));
      add(panel, el('p', 'missing-copy', `The board has no row for ${state.slug}. It may have moved out of the watchlist or the early radar.`));
      const back = el('a', 'button-accent', 'Back to the board');
      back.href = filterHash(state) ? `#${filterHash(state)}` : '#';
      add(panel, back);
      add(shell, panel, footer());
      app.replaceChildren(shell);
      return;
    }

    const shell = el('div', 'shell');
    add(shell, masthead());

    const article = el('article', 'detail');
    const back = el('a', 'back-link', '\u2190 Back to the board');
    back.href = filterHash(state) ? `#${filterHash(state)}` : '#';
    add(article, back);

    const header = el('header', 'detail-hero');
    const main = el('div', 'detail-main');
    const kicker = el('div', 'detail-kicker');
    add(kicker, el('span', 'chip', categoryText(row)), el('span', 'rank-line mono', `Rank ${row.rank}`));
    add(main, kicker, el('h1', 'detail-title', row.name), el('p', 'detail-chains', chainText(row.chains, 8)));
    const valueBlock = el('div', 'detail-value');
    add(
      valueBlock,
      el('div', 'detail-value-label', 'Implied value'),
      el('div', 'detail-value-number mono', fmtUsd(row.implied_value_usd, true)),
      el('div', 'detail-value-note', 'A model output, not a promise'),
    );
    add(header, main, valueBlock);
    add(article, header);

    const equationPanel = el('section', 'panel equation-panel');
    add(equationPanel, el('p', 'eyebrow', 'The arithmetic'), el('h2', 'panel-title', 'How this value is built'));
    const equation = el('div', 'equation');
    add(
      equation,
      equationFactor('TVL', fmtUsd(row.tvl_usd, true), 'snapshot value'),
      equationOperator('\u00d7'),
      equationFactor('Multiple', fmtX(row.multiple), multipleSource(row)),
      equationOperator('\u00d7'),
      equationFactor('Growth', fmtX(row.growth_multiplier), `7d ${fmtPct(row.change_7d)}, clamped`),
      equationOperator('\u00d7'),
      equationFactor('Maturity', fmtX(row.maturity_multiplier), `age ${fmtAge(row.age_days)}`),
      equationOperator('='),
      equationFactor('Implied value', fmtUsd(row.implied_value_usd, true), 'ranked value', true),
    );
    add(equationPanel, equation);
    add(article, equationPanel);

    const metricsPanel = el('section', 'panel metrics-panel');
    add(metricsPanel, el('p', 'eyebrow', 'Metrics'), el('h2', 'panel-title', 'The row behind the number'));
    const metrics = el('div', 'metrics-grid');
    add(
      metrics,
      metric('TVL', fmtUsd(row.tvl_usd, true), 'snapshot USD'),
      metric('7d change', fmtPct(row.change_7d), row.change_7d === null ? 'not reported' : 'seven-day move'),
      metric('Age', fmtAge(row.age_days), row.listed_at === null ? '365 for an unknown listing' : 'since listing'),
      metric('mcap / TVL multiple', fmtX(row.multiple), row.multiple_source === 'category' ? 'category median' : 'overall median'),
      metric('Growth multiplier', fmtX(row.growth_multiplier), `${row.growth_pct.toFixed(1)}% clamped`),
      metric('Maturity multiplier', fmtX(row.maturity_multiplier), '0.6 to 1.0 by age'),
      metric('Listed date', fmtDate(row.listed_at), 'snapshot record'),
      metric('Token status', 'Pre-token', 'no market cap, id or symbol'),
    );
    add(metricsPanel, metrics);
    add(article, metricsPanel);

    const farmPanel = el('section', 'panel farm-panel');
    add(farmPanel, el('p', 'eyebrow', 'Farm plan'), el('h2', 'panel-title', 'Six steps, with cost and time'));
    add(farmPanel, el('p', 'panel-copy', 'Derived from this protocol\'s category, chains, TVL and age. It is a budget and a checklist, not an endorsement.'));
    const farmList = el('ol', 'farm-list');
    row.farm.forEach((step, index) => {
      const li = el('li', 'farm-step');
      const number = el('div', 'step-number mono', String(index + 1).padStart(2, '0'));
      const body = el('div', 'step-body');
      const pills = el('div', 'step-pills');
      add(pills, el('span', 'pill pill-cost', `Cost: ${step.cost}`), el('span', 'pill pill-time', `Time: ${step.time}`));
      add(body, el('p', 'step-action', step.text), pills);
      add(li, number, body);
      farmList.append(li);
    });
    add(farmPanel, farmList);
    add(article, farmPanel);

    const comparePanel = el('section', 'panel compare-panel');
    add(comparePanel, el('p', 'eyebrow', 'Same category'), el('h2', 'panel-title', 'Live-token comparison'));
    const peers = data.live.filter((item) => item.category === row.category).slice(0, 6);
    if (peers.length === 0) {
      add(
        comparePanel,
        el('p', 'panel-copy', `No live-token protocol in ${categoryText(row)} appears in the live sample. The row still uses the overall median when the category has fewer than ${MIN_CATEGORY_SAMPLES} samples.`),
      );
    } else {
      add(comparePanel, el('p', 'panel-copy', 'These protocols already trade. Their mcap / TVL is the market comparison, never a rank against this pre-token row.'));
      const list = el('ol', 'live-list compare-list');
      for (const item of peers) {
        const li = el('li', 'live-item');
        const info = el('div', 'live-main');
        add(info, el('div', 'live-name', item.name), el('div', 'live-category', chainText(item.chains)));
        const numbers = el('div', 'live-numbers');
        add(numbers, el('div', 'mono live-ratio', fmtX(item.ratio)), el('div', `mono live-change${item.change_7d !== null && item.change_7d < 0 ? ' negative' : ''}`, fmtPct(item.change_7d)));
        add(li, info, numbers);
        list.append(li);
      }
      add(comparePanel, list);
    }
    add(article, comparePanel);

    add(shell, article, footer());
    app.replaceChildren(shell);
    window.scrollTo(0, 0);
  }

  function render() {
    if (!data || !Array.isArray(data.rows) || !Array.isArray(data.live) || !data.multiples) {
      renderMissing('The radar data is missing or incomplete, so the board cannot be rendered.');
      return;
    }
    verifyRows(data.rows);
    const state = parseHash();
    if (state.slug) renderDetail(state);
    else renderHome(state);
  }

  if (!data) {
    renderMissing('This page could not find window.RADAR. The data file may be missing beside the dashboard.');
    return;
  }

  window.addEventListener('hashchange', render);
  render();
})();
