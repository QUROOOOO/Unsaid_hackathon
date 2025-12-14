/* =========================
   GitGrade — index.js
   Vanilla JS + GitHub REST API + Chart.js (+ Matrix heatmap)
   ========================= */
'use strict';

(() => {
  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);

  const els = {
    // Inputs / actions
    repoForm: $('repoForm'),
    repoUrl: $('repoUrl'),
    analyzeBtn: $('analyzeBtn'),
    demoBtn: $('demoBtn'),
    resetBtn: $('resetBtn'),
    copyLinkBtn: $('copyLinkBtn'),

    // Status
    statusBox: $('statusBox'),

    // KPI / report
    overallScore: $('overallScore'),
    gradeLabel: $('gradeLabel'),
    kpiFiles: $('kpiFiles'),
    kpiFolders: $('kpiFolders'),
    kpiCommits: $('kpiCommits'),
    kpiPrimaryLang: $('kpiPrimaryLang'),

    execSummary: $('execSummary'),           // now a KV container
    recruiterSignals: $('recruiterSignals'), // now a SIGGRID container
    detailedAnalysis: $('detailedAnalysis'),
    roadmap: $('roadmap'),

    // Charts
    scoreChart: $('scoreChart'),
    radarChart: $('radarChart'),
    breakdownChart: $('breakdownChart'),
    fileTypeChart: $('fileTypeChart'),
    commitChart: $('commitChart'),
    heatmapChart: $('heatmapChart'),

    // Loading overlay
    loadingOverlay: $('loadingOverlay'),
    loadingText: $('loadingText'),

    // Cursor dot
    cursorDot: $('cursorDot'),
  };

  // ---------- State ----------
  let aborter = null;

  const chartState = {
    score: null,
    radar: null,
    breakdown: null,
    fileTypes: null,
    commits: null,
    heatmap: null,
  };

  // ---------- Small utilities ----------
  function showStatus(message, kind = 'info') {
    if (!els.statusBox) return;
    const msg = String(message || '').trim();

    if (!msg) {
      els.statusBox.className = 'status';
      els.statusBox.textContent = '';
      return;
    }

    els.statusBox.className = kind === 'error' ? 'status error' : 'status';
    els.statusBox.textContent = msg;
  }

  function setBusy(isBusy) {
    if (els.analyzeBtn) els.analyzeBtn.disabled = isBusy;
    if (els.demoBtn) els.demoBtn.disabled = isBusy;
    if (els.resetBtn) els.resetBtn.disabled = isBusy;
  }

  function setOverlay(on, text = 'Fetching GitHub data and generating the report…') {
    if (!els.loadingOverlay) return;
    if (els.loadingText) els.loadingText.textContent = text;

    if (on) {
      els.loadingOverlay.hidden = false;
      els.loadingOverlay.setAttribute('aria-hidden', 'false');
    } else {
      els.loadingOverlay.hidden = true;
      els.loadingOverlay.setAttribute('aria-hidden', 'true');
    }
  }

  function escapeHtml(s) {
    return String(s || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function destroyChart(ch) {
    if (ch && typeof ch.destroy === 'function') ch.destroy();
    return null;
  }

  function debounce(fn, wait = 200) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  function animateCount(el, to, { duration = 700 } = {}) {
    if (!el) return;
    const from = Number(String(el.textContent || '').replace(/[^\d.-]/g, '')) || 0;
    const start = performance.now();

    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - t, 3);
      el.textContent = String(Math.round(from + (to - from) * e));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function pulse(el) {
    if (!el || !el.animate) return;
    el.animate(
      [
        { transform: 'translateY(0)', filter: 'brightness(1)' },
        { transform: 'translateY(-2px)', filter: 'brightness(1.06)' },
        { transform: 'translateY(0)', filter: 'brightness(1)' },
      ],
      { duration: 520, easing: 'cubic-bezier(.2,.9,.2,1)' }
    );
  }

  // ---------- Scroll reveal ----------
  function initReveal() {
    const nodes = Array.from(document.querySelectorAll('[data-reveal]'));
    if (!nodes.length || typeof IntersectionObserver === 'undefined') {
      // fallback: show immediately
      nodes.forEach(n => n.classList.add('is-in'));
      return;
    }

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      }
    }, { root: null, threshold: 0.12, rootMargin: '0px 0px -10% 0px' }); // [web:334]

    nodes.forEach(n => io.observe(n));
  }

  // ---------- Cursor dot ----------
  function initCursorDot() {
    const dot = els.cursorDot;
    if (!dot) return;

    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let tx = x, ty = y;

    const move = (e) => {
      tx = e.clientX;
      ty = e.clientY;
    };

    const loop = () => {
      x += (tx - x) * 0.22;
      y += (ty - y) * 0.22;
      dot.style.left = `${x}px`;
      dot.style.top = `${y}px`;
      requestAnimationFrame(loop);
    };

    window.addEventListener('mousemove', move, { passive: true });

    window.addEventListener('mousedown', () => {
      dot.classList.add('is-click');
      setTimeout(() => dot.classList.remove('is-click'), 140);
    });

    requestAnimationFrame(loop);
  }

  // ---------- URL parsing ----------
  function parseGitHubRepoUrl(input) {
    let url;
    try {
      url = new URL(input);
    } catch {
      return { ok: false, error: 'Invalid URL. Example: https://github.com/owner/repo' };
    }

    const host = url.hostname.toLowerCase();
    if (host !== 'github.com' && host !== 'www.github.com') {
      return { ok: false, error: 'Only github.com repository links are supported.' };
    }

    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2) {
      return { ok: false, error: 'URL must be like: https://github.com/owner/repo' };
    }

    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/i, '');

    if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) {
      return { ok: false, error: 'Owner/repo contains unsupported characters.' };
    }

    return { ok: true, owner, repo };
  }

  // ---------- GitHub fetch helpers ----------
  async function ghFetchJson(url, { signal } = {}) {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/vnd.github+json' },
      signal,
    });

    const txt = await res.text();
    let data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch { /* ignore */ }

    if (!res.ok) {
      const msg = (data && data.message) ? data.message : `GitHub API error (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      err.url = url;
      throw err;
    }
    return data;
  }

  async function ghFetchRawReadme(owner, repo, { signal } = {}) {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, {
      headers: { Accept: 'application/vnd.github.raw' },
      signal,
    });
    if (!res.ok) return '';
    return await res.text();
  }

  async function getDefaultBranchHeadSha(owner, repo, defaultBranch, { signal } = {}) {
    const data = await ghFetchJson(
      `https://api.github.com/repos/${owner}/${repo}/branches/${encodeURIComponent(defaultBranch)}`,
      { signal }
    );
    return data?.commit?.sha || null;
  }

  async function fetchRepoBundle(owner, repo, { signal } = {}) {
    setOverlay(true, 'Fetching repository metadata…');
    const repoMeta = await ghFetchJson(`https://api.github.com/repos/${owner}/${repo}`, { signal });
    const defaultBranch = repoMeta?.default_branch || 'main';

    setOverlay(true, 'Fetching language breakdown…');
    const languages = await ghFetchJson(`https://api.github.com/repos/${owner}/${repo}/languages`, { signal });

    setOverlay(true, 'Fetching recent commits (sample)…');
    const commits = await ghFetchJson(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=100`, { signal });

    setOverlay(true, 'Fetching README…');
    const readme = await ghFetchRawReadme(owner, repo, { signal });

    setOverlay(true, 'Fetching repository file tree…');
    const headSha = await getDefaultBranchHeadSha(owner, repo, defaultBranch, { signal });
    if (!headSha) throw new Error('Could not resolve default branch head SHA.');

    const treeData = await ghFetchJson(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(headSha)}?recursive=1`,
      { signal }
    );

    const tree = Array.isArray(treeData?.tree) ? treeData.tree : [];
    return { repoMeta, languages, commits, readme, tree };
  }

  // ---------- Chart.js: Matrix readiness ----------
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve(true);
      s.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(s);
    });
  }

  function hasMatrixController() {
    try {
      return !!(Chart?.registry?.getController && Chart.registry.getController('matrix'));
    } catch {
      return false;
    }
  }

  async function ensureMatrixReady() {
    if (hasMatrixController()) return true;

    const urls = [
      'https://cdn.jsdelivr.net/npm/chartjs-chart-matrix@3.0.0/dist/chartjs-chart-matrix.umd.min.js',
      'https://unpkg.com/chartjs-chart-matrix@3.0.0/dist/chartjs-chart-matrix.umd.min.js'
    ];

    for (const u of urls) {
      try {
        await loadScript(u);
        if (hasMatrixController()) return true;
      } catch {
        // try next
      }
    }
    return false;
  }

  // ---------- Analysis helpers ----------
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }
  function score100(x01) { return Math.round(clamp01(x01) * 100); }

  function extOf(path) {
    const m = String(path || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? m[1] : '(no-ext)';
  }

  function isTestPath(path) {
    const p = String(path || '').toLowerCase();
    return (
      p.includes('/test/') ||
      p.includes('/tests/') ||
      p.includes('/__tests__/') ||
      p.includes('/spec/') ||
      p.endsWith('.test.js') || p.endsWith('.spec.js') ||
      p.endsWith('.test.ts') || p.endsWith('.spec.ts') ||
      p.endsWith('.test.jsx') || p.endsWith('.spec.jsx') ||
      p.endsWith('.test.tsx') || p.endsWith('.spec.tsx') ||
      p.endsWith('_test.py') || p.endsWith('test_.py')
    );
  }

  function countKeywordHits(text, keywords) {
    const t = String(text || '').toLowerCase();
    let hits = 0;
    for (const k of keywords) if (t.includes(k)) hits++;
    return hits;
  }

  function gradeFromScore(s) {
    if (s >= 90) return 'Gold';
    if (s >= 75) return 'Silver';
    if (s >= 60) return 'Bronze';
    return 'Needs Work';
  }

  function computeCommitBuckets(commits, buckets = 8) {
    const dates = (Array.isArray(commits) ? commits : [])
      .map(c => c?.commit?.author?.date || c?.commit?.committer?.date)
      .filter(Boolean)
      .map(d => new Date(d))
      .filter(d => !Number.isNaN(d.getTime()))
      .sort((a, b) => a - b);

    const values = Array(buckets).fill(0);
    const labels = Array.from({ length: buckets }, () => '');

    if (dates.length === 0) return { labels: labels.map((_, i) => `W${i + 1}`), values };

    const last = dates[dates.length - 1];
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const start = new Date(last.getTime() - (buckets - 1) * weekMs);

    for (const d of dates) {
      const idx = Math.floor((d - start) / weekMs);
      if (idx >= 0 && idx < buckets) values[idx]++;
    }

    const fmt = (dt) => `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`;
    for (let i = 0; i < buckets; i++) labels[i] = fmt(new Date(start.getTime() + i * weekMs));

    return { labels, values };
  }

  // Heatmap helpers (matrix)
  function buildCommitHeatmap(commits, weeks = 20) {
    const dayMs = 24 * 60 * 60 * 1000;

    const dates = (Array.isArray(commits) ? commits : [])
      .map(c => c?.commit?.author?.date || c?.commit?.committer?.date)
      .filter(Boolean)
      .map(d => new Date(d))
      .filter(d => !Number.isNaN(d.getTime()));

    const dayCounts = new Map();
    for (const d of dates) {
      const key = d.toISOString().slice(0, 10);
      dayCounts.set(key, (dayCounts.get(key) || 0) + 1);
    }

    const end = new Date();
    end.setUTCHours(0, 0, 0, 0);

    const start = new Date(end.getTime() - (weeks * 7 - 1) * dayMs);
    const dow = start.getUTCDay(); // 0=Sun
    start.setTime(start.getTime() - dow * dayMs);

    const cells = [];
    let maxV = 0;

    for (let w = 0; w < weeks; w++) {
      for (let d = 0; d < 7; d++) {
        const dt = new Date(start.getTime() + (w * 7 + d) * dayMs);
        const key = dt.toISOString().slice(0, 10);
        const v = dayCounts.get(key) || 0;
        if (v > maxV) maxV = v;
        cells.push({ x: w, y: d, v, date: key });
      }
    }

    return { cells, weeks, maxV };
  }

  function heatColor(v, maxV) {
    if (!maxV || v <= 0) return 'rgba(148,163,184,0.10)';
    const t = Math.min(1, v / maxV);
    const r = 34;
    const g = Math.round(197 + (245 - 197) * t);
    const b = Math.round(94 + (158 - 94) * t);
    return `rgba(${r},${g},${b},${0.18 + 0.55 * t})`;
  }

  function analyzeRepo({ repoMeta, languages, commits, readme, tree }) {
    const files = tree.filter(x => x.type === 'blob');
    const folders = tree.filter(x => x.type === 'tree');
    const pathsLower = tree.map(x => String(x.path || '').toLowerCase());
    const pathsSet = new Set(pathsLower);

    const fileCount = files.length;
    const folderCount = folders.length;

    const extCounts = {};
    for (const f of files) {
      const e = extOf(f.path);
      extCounts[e] = (extCounts[e] || 0) + 1;
    }
    const topExt = Object.entries(extCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

    const testCount = files.filter(f => isTestPath(f.path)).length;

    const readmeText = String(readme || '');
    const readmeLen = readmeText.trim().length;
    const docKeywords = ['install', 'setup', 'usage', 'features', 'api', 'demo', 'license', 'contributing', 'run', 'build'];
    const docHits = countKeywordHits(readmeText, docKeywords);

    const has = (p) => pathsSet.has(p.toLowerCase());
    const starts = (prefix) => pathsLower.some(p => p.startsWith(prefix.toLowerCase()));

    const hasSrc = has('src') || starts('src/');
    const hasDocs = has('docs') || starts('docs/');
    const hasGitignore = has('.gitignore');
    const hasLicense = has('license') || has('license.md') || has('license.txt');
    const hasReadme = has('readme.md') || has('readme');
    const hasPkg = has('package.json');
    const hasReq = has('requirements.txt') || has('pyproject.toml');
    const hasWorkflows = starts('.github/workflows/');
    const hasEnvExample = pathsLower.some(p => p.includes('.env.example') || p.includes('.env.sample'));
    const hasLintConfig =
      has('.eslintrc') || has('.eslintrc.json') || has('.eslintrc.js') || has('.eslintrc.cjs') ||
      has('.prettierrc') || has('.prettierrc.json') || has('.prettierrc.js') ||
      has('ruff.toml') || has('.ruff.toml') || has('pyproject.toml');

    const structureSignals = [
      hasSrc, hasDocs, hasReadme, hasGitignore, hasLicense,
      hasPkg || hasReq, hasWorkflows, hasEnvExample, hasLintConfig
    ].filter(Boolean).length;

    const commitDates = (Array.isArray(commits) ? commits : [])
      .map(c => c?.commit?.author?.date || c?.commit?.committer?.date)
      .filter(Boolean)
      .map(d => new Date(d))
      .filter(d => !Number.isNaN(d.getTime()));

    const uniqueDays = new Set(commitDates.map(d => d.toISOString().slice(0, 10))).size;
    const recentCommitCount = Array.isArray(commits) ? commits.length : 0;

    const stars = Number(repoMeta?.stargazers_count || 0);
    const forks = Number(repoMeta?.forks_count || 0);
    const openIssues = Number(repoMeta?.open_issues_count || 0);
    const pushedAt = repoMeta?.pushed_at ? new Date(repoMeta.pushed_at) : null;
    const lastUpdate = pushedAt ? pushedAt.toISOString().slice(0, 10) : 'Unknown';
    const daysSinceUpdate = pushedAt ? Math.max(0, (Date.now() - pushedAt.getTime()) / (1000 * 60 * 60 * 24)) : 9999;

    const langEntries = languages ? Object.entries(languages).sort((a, b) => b[1] - a[1]) : [];
    const primaryLang = langEntries[0]?.[0] || repoMeta?.language || 'Unknown';

    const largeFiles = files.filter(f => (f.size || 0) > 300_000).length;

    // Dimension scores
    const codeQuality = score100(
      0.28 * clamp01(fileCount / 140) +
      0.22 * clamp01(1 - (largeFiles / Math.max(1, fileCount))) +
      0.25 * clamp01(Object.keys(extCounts).length / 12) +
      0.25 * clamp01(structureSignals / 9)
    );

    const structure = score100(
      0.60 * clamp01(structureSignals / 9) +
      0.25 * clamp01(folderCount / 30) +
      0.15 * clamp01(hasGitignore ? 1 : 0)
    );

    const documentation = score100(
      0.55 * clamp01(readmeLen / 2600) +
      0.35 * clamp01(docHits / docKeywords.length) +
      0.10 * clamp01(hasLicense ? 1 : 0)
    );

    const tests = score100(
      0.70 * clamp01(testCount / Math.max(1, Math.round(fileCount * 0.08))) +
      0.30 * clamp01(hasWorkflows ? 1 : 0)
    );

    const commitConsistency = score100(
      0.55 * clamp01(uniqueDays / 18) +
      0.30 * clamp01(recentCommitCount / 80) +
      0.15 * clamp01(1 - Math.min(1, daysSinceUpdate / 180))
    );

    const relevance = score100(
      0.38 * clamp01((stars + forks) / 220) +
      0.42 * clamp01(1 - Math.min(1, daysSinceUpdate / 365)) +
      0.20 * clamp01(openIssues / 50)
    );

    const breakdown = {
      codeQuality,
      structure,
      documentation,
      tests,
      commits: commitConsistency,
      relevance
    };

    const overall = Math.round(
      breakdown.codeQuality * 0.25 +
      breakdown.structure * 0.20 +
      breakdown.documentation * 0.20 +
      breakdown.tests * 0.15 +
      breakdown.commits * 0.15 +
      breakdown.relevance * 0.05
    );

    const strengths = [];
    const risks = [];

    if (breakdown.structure >= 75) strengths.push('Clear project structure and conventions.');
    else risks.push('Project structure needs tightening (src/, docs/, config hygiene).');

    if (breakdown.documentation >= 70) strengths.push('README/documentation appears usable.');
    else risks.push('Documentation is weak—add setup, usage, screenshots, and limitations.');

    if (breakdown.tests >= 65) strengths.push('Testing/CI signals found (better maintainability).');
    else risks.push('Tests/CI appear missing or weak (higher regression risk).');

    if (breakdown.commits >= 65) strengths.push('Commit activity suggests iterative development.');
    else risks.push('Commit history sample suggests inconsistent iteration.');

    const detailed = [
      `Code quality: ${breakdown.codeQuality}/100 (file composition, large-file risk, configs).`,
      `Project structure: ${breakdown.structure}/100 (conventions + repository hygiene).`,
      `Documentation: ${breakdown.documentation}/100 (README size + key sections heuristic).`,
      `Testing: ${breakdown.tests}/100 (test discovery + CI signals).`,
      `Commit consistency: ${breakdown.commits}/100 (unique commit days + recency heuristic).`,
      `Relevance: ${breakdown.relevance}/100 (recency + basic popularity/issue signals).`,
    ];

    const roadmap = [];
    if (breakdown.documentation < 60) roadmap.push('CRITICAL: Improve README (setup, usage, screenshots, limitations, license).');
    if (breakdown.structure < 60) roadmap.push('CRITICAL: Organize folders (src/, docs/, tests/) and keep root clean.');
    if (breakdown.tests < 60) roadmap.push('IMPORTANT: Add unit tests for core logic + minimal test runner config.');
    if (breakdown.commits < 60) roadmap.push('IMPORTANT: Commit more consistently (small, meaningful commit messages).');
    roadmap.push('NICE-TO-HAVE: Add CI (GitHub Actions) to run tests/lint on every push.');
    roadmap.push('NICE-TO-HAVE: Add an “Architecture” section explaining design decisions.');

    const commitBuckets = computeCommitBuckets(commits, 8);
    const commitHeatmap = buildCommitHeatmap(commits, 20);

    return {
      overall,
      grade: gradeFromScore(overall),
      breakdown,
      fileCount,
      folderCount,
      primaryLang,
      recentCommitCount,
      topExt,
      commitBuckets,
      detailed,
      roadmap,
      commitHeatmap,
      strengths,
      risks,
      lastUpdate,
      testsDetected: testCount,
      // extra info (optional)
      stars,
      forks,
      openIssues
    };
  }

  // ---------- Rendering: text blocks ----------
  function renderText(a) {
    animateCount(els.overallScore, a.overall);
    if (els.gradeLabel) els.gradeLabel.textContent = `Grade: ${a.grade}`;

    animateCount(els.kpiFiles, a.fileCount);
    animateCount(els.kpiFolders, a.folderCount);
    animateCount(els.kpiCommits, a.recentCommitCount);
    if (els.kpiPrimaryLang) els.kpiPrimaryLang.textContent = String(a.primaryLang);

    // Executive Summary: KV layout
    if (els.execSummary && els.execSummary.querySelectorAll) {
      const rows = els.execSummary.querySelectorAll('.kv__row');
      const setRow = (idx, val) => {
        const v = rows?.[idx]?.querySelector?.('.kv__v');
        if (v) v.textContent = val;
      };

      setRow(0, `${a.grade} (${a.overall}/100)`);
      setRow(1, (a.strengths?.length ? a.strengths.join(' ') : '—'));
      setRow(2, (a.risks?.length ? a.risks.join(' ') : '—'));
    }

    // Recruiter Signals: compact grid
    if (els.recruiterSignals && els.recruiterSignals.querySelectorAll) {
      const sigs = els.recruiterSignals.querySelectorAll('.sig');
      const setSig = (idx, val) => {
        const v = sigs?.[idx]?.querySelector?.('.sig__v');
        if (v) v.textContent = val;
      };

      setSig(0, String(a.primaryLang));
      setSig(1, `${a.fileCount} files • ${a.folderCount} folders`);
      setSig(2, String(a.testsDetected ?? 0));
      setSig(3, String(a.lastUpdate ?? 'Unknown'));
    }

    if (els.detailedAnalysis) {
      els.detailedAnalysis.innerHTML = a.detailed.map(x => `<li>${escapeHtml(x)}</li>`).join('');
    }
    if (els.roadmap) {
      els.roadmap.innerHTML = a.roadmap.map(x => `<li>${escapeHtml(x)}</li>`).join('');
    }

    pulse(els.execSummary?.closest?.('.card'));
    pulse(els.recruiterSignals?.closest?.('.card'));
  }

  // ---------- Chart theme ----------
  function initChartTheme() {
    if (typeof Chart === 'undefined') return;

    Chart.defaults.responsive = true;
    Chart.defaults.maintainAspectRatio = false;
    Chart.defaults.color = 'rgba(255,255,255,0.85)';
    Chart.defaults.font.family =
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial';

    Chart.defaults.plugins.legend.display = false;
    Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(10,14,25,0.92)';
    Chart.defaults.plugins.tooltip.borderColor = 'rgba(255,255,255,0.12)';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.titleColor = 'rgba(255,255,255,0.92)';
    Chart.defaults.plugins.tooltip.bodyColor = 'rgba(255,255,255,0.85)';

    // Better hover tooltips anywhere near data [web:341]
    Chart.defaults.interaction = { mode: 'nearest', intersect: false, axis: 'xy' };
    Chart.defaults.hover = { mode: 'nearest', intersect: false };

    // Global animation
    Chart.defaults.animation = { duration: 900, easing: 'easeOutQuart' };
    Chart.defaults.transitions = {
      active: { animation: { duration: 250 } },
      resize: { animation: { duration: 250 } }
    };
  }

  // ---------- Render charts ----------
  async function renderCharts(a) {
    if (typeof Chart === 'undefined') {
      showStatus('Chart.js not loaded. Check the Chart.js script tag.', 'error');
      return;
    }

    const gridColor = 'rgba(255,255,255,0.12)';
    const tickColor = 'rgba(255,255,255,0.75)';
    const labelColor = 'rgba(255,255,255,0.85)';

    // Score donut
    chartState.score = destroyChart(chartState.score);
    if (els.scoreChart) {
      chartState.score = new Chart(els.scoreChart, {
        type: 'doughnut',
        data: {
          labels: ['Score', 'Remaining'],
          datasets: [{
            data: [a.overall, Math.max(0, 100 - a.overall)],
            backgroundColor: ['rgba(34,197,94,0.95)', 'rgba(226,232,240,0.16)'],
            borderWidth: 0,
            hoverOffset: 8
          }]
        },
        options: { cutout: '74%' }
      });
    }

    // Radar
    chartState.radar = destroyChart(chartState.radar);
    if (els.radarChart) {
      const b = a.breakdown;
      chartState.radar = new Chart(els.radarChart, {
        type: 'radar',
        data: {
          labels: ['Code', 'Structure', 'Docs', 'Tests', 'Commits', 'Relevance'],
          datasets: [{
            data: [b.codeQuality, b.structure, b.documentation, b.tests, b.commits, b.relevance],
            borderColor: 'rgba(56,189,248,0.95)',
            backgroundColor: 'rgba(56,189,248,0.12)',
            pointBackgroundColor: 'rgba(56,189,248,0.95)',
            borderWidth: 2
          }]
        },
        options: {
          scales: {
            r: {
              beginAtZero: true,
              suggestedMax: 100,
              angleLines: { color: gridColor },
              grid: { color: gridColor },
              pointLabels: { color: labelColor, font: { size: 12 } },
              ticks: { color: tickColor, backdropColor: 'transparent' }
            }
          }
        }
      });
    }

    // Score breakdown bars
    chartState.breakdown = destroyChart(chartState.breakdown);
    if (els.breakdownChart) {
      const b = a.breakdown;
      chartState.breakdown = new Chart(els.breakdownChart, {
        type: 'bar',
        data: {
          labels: ['Code', 'Structure', 'Docs', 'Tests', 'Commits', 'Relevance'],
          datasets: [{
            data: [b.codeQuality, b.structure, b.documentation, b.tests, b.commits, b.relevance],
            backgroundColor: [
              'rgba(56,189,248,0.35)',
              'rgba(56,189,248,0.28)',
              'rgba(56,189,248,0.22)',
              'rgba(245,158,11,0.25)',
              'rgba(34,197,94,0.25)',
              'rgba(148,163,184,0.20)'
            ],
            borderColor: 'rgba(255,255,255,0.18)',
            borderWidth: 1,
            borderRadius: 10
          }]
        },
        options: {
          scales: {
            x: { ticks: { color: tickColor }, grid: { color: 'transparent' } },
            y: { beginAtZero: true, suggestedMax: 100, ticks: { color: tickColor }, grid: { color: gridColor } }
          }
        }
      });
    }

    // File types (remove “blue-ish lines”: hide grids + axis borders)
    chartState.fileTypes = destroyChart(chartState.fileTypes);
    if (els.fileTypeChart) {
      const topExt = a.topExt.length ? a.topExt : [['(no-data)', 0]];
      chartState.fileTypes = new Chart(els.fileTypeChart, {
        type: 'bar',
        data: {
          labels: topExt.map(([k]) => k),
          datasets: [{
            data: topExt.map(([, v]) => v),
            backgroundColor: 'rgba(124,58,237,0.35)',
            borderColor: 'rgba(124,58,237,0.85)',
            borderWidth: 1.5,
            borderRadius: 10
          }]
        },
        options: {
          scales: {
            x: { ticks: { color: tickColor }, grid: { display: false }, border: { display: false } },
            y: { ticks: { color: tickColor }, grid: { display: false }, border: { display: false } }
          }
        }
      });
    }

    // Commit trend (remove “blue-ish lines”: hide grids + axis borders)
    chartState.commits = destroyChart(chartState.commits);
    if (els.commitChart) {
      chartState.commits = new Chart(els.commitChart, {
        type: 'line',
        data: {
          labels: a.commitBuckets.labels,
          datasets: [{
            data: a.commitBuckets.values,
            borderColor: 'rgba(34,197,94,0.92)',
            backgroundColor: 'rgba(34,197,94,0.10)',
            fill: true,
            tension: 0.35,
            pointRadius: 3,
            pointHoverRadius: 6
          }]
        },
        options: {
          scales: {
            x: { ticks: { color: tickColor }, grid: { display: false }, border: { display: false } },
            y: { ticks: { color: tickColor }, grid: { display: false }, border: { display: false } }
          },
          plugins: {
            tooltip: {
              callbacks: {
                label: (item) => `Commits: ${item.raw ?? 0}`
              }
            }
          }
        }
      });
    }

    // Heatmap (matrix): only if plugin is registered
    chartState.heatmap = destroyChart(chartState.heatmap);
    if (els.heatmapChart) {
      const ok = await ensureMatrixReady();
      if (!ok) {
        // Graceful: show message, keep rest of report working
        showStatus('Heatmap unavailable: matrix plugin failed to load. Charts still work.', 'error');
        return;
      }

      const hm = a.commitHeatmap;

      chartState.heatmap = new Chart(els.heatmapChart, {
        type: 'matrix',
        data: {
          datasets: [{
            label: 'Commits',
            data: hm.cells.map(c => ({ x: c.x, y: c.y, v: c.v, date: c.date })),
            backgroundColor: (ctx) => heatColor(ctx.raw?.v || 0, hm.maxV),
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.06)',
            width: (ctx) => {
              const area = ctx.chart.chartArea;
              if (!area) return 10;
              return (area.width / hm.weeks) - 2;
            },
            height: (ctx) => {
              const area = ctx.chart.chartArea;
              if (!area) return 10;
              return (area.height / 7) - 2;
            }
          }]
        },
        options: {
          plugins: {
            tooltip: {
              callbacks: {
                title: (items) => items?.[0]?.raw?.date ? items[0].raw.date : '',
                label: (item) => `Commits: ${item.raw?.v ?? 0}`
              }
            }
          },
          scales: {
            x: { type: 'linear', display: false, min: -0.5, max: hm.weeks - 0.5 },
            y: { type: 'linear', display: false, min: -0.5, max: 6.5 }
          }
        }
      });
    }
  }

  // ---------- Reset ----------
  function clearReportText() {
    if (els.overallScore) els.overallScore.textContent = '--';
    if (els.gradeLabel) els.gradeLabel.textContent = 'Grade: --';
    if (els.kpiFiles) els.kpiFiles.textContent = '--';
    if (els.kpiFolders) els.kpiFolders.textContent = '--';
    if (els.kpiCommits) els.kpiCommits.textContent = '--';
    if (els.kpiPrimaryLang) els.kpiPrimaryLang.textContent = '--';

    // restore placeholders for the new layouts
    if (els.execSummary) {
      const rows = els.execSummary.querySelectorAll?.('.kv__row .kv__v');
      if (rows?.length) rows.forEach(v => v.textContent = '--');
    }
    if (els.recruiterSignals) {
      const vals = els.recruiterSignals.querySelectorAll?.('.sig__v');
      if (vals?.length) vals.forEach(v => v.textContent = '--');
    }

    if (els.detailedAnalysis) els.detailedAnalysis.innerHTML = '<li>--</li>';
    if (els.roadmap) els.roadmap.innerHTML = '<li>--</li>';
  }

  function resetAll() {
    if (aborter) aborter.abort();
    showStatus('');
    setOverlay(false);
    clearReportText();
    if (els.repoUrl) els.repoUrl.value = '';

    chartState.score = destroyChart(chartState.score);
    chartState.radar = destroyChart(chartState.radar);
    chartState.breakdown = destroyChart(chartState.breakdown);
    chartState.fileTypes = destroyChart(chartState.fileTypes);
    chartState.commits = destroyChart(chartState.commits);
    chartState.heatmap = destroyChart(chartState.heatmap);
  }

  // ---------- Share link ----------
  async function copyShareLink() {
    const url = new URL(window.location.href);
    const val = String(els.repoUrl?.value || '').trim();
    if (val) url.searchParams.set('repo', val);

    try {
      await navigator.clipboard.writeText(url.toString());
      showStatus('Share link copied.', 'info');
      pulse(els.copyLinkBtn);
    } catch {
      showStatus('Could not copy automatically. Copy from the address bar.', 'error');
    }
  }

  // ---------- Main flow ----------
  async function runAnalysis(repoUrl) {
    if (aborter) aborter.abort();
    aborter = new AbortController();

    const parsed = parseGitHubRepoUrl(repoUrl);
    if (!parsed.ok) {
      showStatus(parsed.error, 'error');
      return;
    }

    clearReportText();
    showStatus('');
    setBusy(true);
    setOverlay(true, 'Fetching GitHub data and generating the report…');

    try {
      const { owner, repo } = parsed;

      const bundle = await fetchRepoBundle(owner, repo, { signal: aborter.signal });

      setOverlay(true, 'Analyzing repository signals…');
      const analysis = analyzeRepo(bundle);

      renderText(analysis);

      setOverlay(true, 'Rendering charts…');
      await renderCharts(analysis);

      setOverlay(false);
      showStatus('Analysis complete. Try another public repo URL.', 'info');

      pulse(els.overallScore?.closest?.('.glasscard'));
    } catch (e) {
      setOverlay(false);

      const msg = String(e?.message || e);
      if (msg.toLowerCase().includes('api rate limit exceeded')) {
        showStatus('GitHub rate limit exceeded. Wait a bit and retry.', 'error');
      } else if (e?.name === 'AbortError') {
        showStatus('Previous analysis cancelled.', 'info');
      } else {
        showStatus(`Error: ${msg}`, 'error');
      }
    } finally {
      setBusy(false);
    }
  }

  // ---------- Resize handling ----------
  const onResize = debounce(() => {
    for (const k of Object.keys(chartState)) {
      const ch = chartState[k];
      if (ch && typeof ch.resize === 'function') ch.resize();
      if (ch && typeof ch.update === 'function') ch.update('none');
    }
  }, 180);

  // ---------- Init ----------
  function init() {
    initChartTheme();
    initReveal();
    initCursorDot();

    // Prefill from share link ?repo=
    const prefill = new URLSearchParams(window.location.search).get('repo');
    if (prefill && els.repoUrl) {
      els.repoUrl.value = prefill;
      showStatus('Repo URL loaded from share link. Click Analyze.', 'info');
    }

    if (els.copyLinkBtn) els.copyLinkBtn.addEventListener('click', copyShareLink);

    if (els.demoBtn) {
      els.demoBtn.addEventListener('click', () => {
        els.repoUrl.value = 'https://github.com/vercel/next.js';
        showStatus('Demo repo loaded. Click Analyze.', 'info');
        pulse(els.demoBtn);
      });
    }

    if (els.resetBtn) els.resetBtn.addEventListener('click', resetAll);

    if (els.repoForm) {
      els.repoForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const val = String(els.repoUrl?.value || '').trim();
        if (!val) return showStatus('Paste a GitHub repository URL first.', 'error');
        runAnalysis(val);
      });
    } else if (els.analyzeBtn) {
      els.analyzeBtn.addEventListener('click', () => runAnalysis(String(els.repoUrl?.value || '').trim()));
    }

    window.addEventListener('resize', onResize, { passive: true });
  }

  init();
})();
