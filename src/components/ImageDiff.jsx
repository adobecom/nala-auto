import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import ReactCompareImage from 'react-compare-image';

const HOST = 'https://s3-sj3.corp.adobe.com/milo';

const defaultZoom = () => (window.innerWidth < 640 ? 0.4 : window.innerWidth < 1024 ? 0.65 : 1);

const getPathSlug = (url) => {
  try {
    return new URL(url).pathname.split('/').filter(Boolean).pop()?.replace(/\.html$/, '') || 'home';
  } catch {
    return 'home';
  }
};

const imgUrl = (p) => {
  if (!p) return null;
  // Encode each segment so spaces in filenames (e.g. "BACOM Visual Comparison-...") become %20
  const encoded = p.split('/').map(encodeURIComponent).join('/');
  return `${HOST}/${encoded}`;
};

const Thumb = ({ src }) => {
  const [errored, setErrored] = useState(false);
  if (!src || errored) return <div className="w-full h-full bg-gray-300" />;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className="w-full h-full object-cover object-top"
      onError={() => setErrored(true)}
    />
  );
};

const parseUrls = (raw) => {
  const parts = (raw || '').split(' | ').map((s) => s.trim()).filter(Boolean);
  return { urlA: parts[0] || null, urlB: parts[1] || parts[0] || null };
};

const preloadImage = (src) => {
  if (!src) return;
  const img = new Image();
  img.src = src;
};

const ZoomControls = ({ zoom, setZoom, getResetZoom, className = '' }) => (
  <div className={`flex items-center gap-1 bg-black/60 rounded px-2 py-1 ${className}`}>
    <button
      onClick={() => setZoom((z) => Math.max(0.25, parseFloat((z - 0.25).toFixed(2))))}
      className="w-6 h-6 flex items-center justify-center text-white hover:text-gray-300 text-base leading-none"
      title="Zoom out"
    >−</button>
    <span className="text-white text-xs font-mono w-10 text-center">{Math.round(zoom * 100)}%</span>
    <button
      onClick={() => setZoom((z) => Math.min(4, parseFloat((z + 0.25).toFixed(2))))}
      className="w-6 h-6 flex items-center justify-center text-white hover:text-gray-300 text-base leading-none"
      title="Zoom in"
    >+</button>
    <button
      onClick={() => setZoom(getResetZoom())}
      className="text-xs text-gray-400 hover:text-white ml-1"
      title="Reset zoom"
    >reset</button>
  </div>
);

const deviceLabel = (b) => {
  if (b === 'ipad') return 'Tablet Chrome';
  if (b === 'iphone') return 'Mobile Chrome';
  return `Desktop ${b.charAt(0).toUpperCase()}${b.slice(1)}`;
};

const ImageDiff = ({ data, timestamp, isDarkMode: dark }) => {
  const allSnapshots = useMemo(() => {
    const list = [];
    Object.entries(data).forEach(([category, comparisons]) => {
      const parts = category.split('-');
      const browser = parts[parts.length - 1].trim();
      comparisons.forEach((item, i) => {
        const { urlA, urlB } = parseUrls(item.urls);
        list.push({
          ...item,
          category,
          id: `${category}--${i}`,
          browser,
          hasDiff: !!item.diff,
          urlA,
          urlB,
        });
      });
    });
    return list;
  }, [data]);

  const browsers = useMemo(() => [...new Set(allSnapshots.map((s) => s.browser))], [allSnapshots]);
  const diffCount = useMemo(() => allSnapshots.filter((s) => s.hasDiff).length, [allSnapshots]);

  const [showOnlyDiff, setShowOnlyDiff] = useState(true);
  const [activeBrowser, setActiveBrowser] = useState(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [viewMode, setViewMode] = useState('split');
  const [diffOverlay, setDiffOverlay] = useState(false);
  const [diffRaw, setDiffRaw] = useState(false);
  const [diffZoom, setDiffZoom] = useState(defaultZoom);
  const [splitZoom, setSplitZoom] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);
  const sidebarRef = useRef(null);
  const leftPanelRef = useRef(null);
  const rightPanelRef = useRef(null);
  const scrollingRef = useRef(null); // tracks which panel initiated scroll to avoid loops

  const syncScroll = useCallback((source, target) => (e) => {
    if (scrollingRef.current && scrollingRef.current !== source) return;
    scrollingRef.current = source;
    target.current.scrollTop = e.currentTarget.scrollTop;
    requestAnimationFrame(() => { scrollingRef.current = null; });
  }, []);

  const filtered = useMemo(
    () =>
      allSnapshots.filter((s) => {
        if (showOnlyDiff && !s.hasDiff) return false;
        if (activeBrowser && s.browser !== activeBrowser) return false;
        return true;
      }),
    [allSnapshots, showOnlyDiff, activeBrowser],
  );

  useEffect(() => {
    setActiveIdx(0);
  }, [showOnlyDiff, activeBrowser]);

  // If the diff-only filter leaves nothing, fall back to showing all
  useEffect(() => {
    if (showOnlyDiff && allSnapshots.length > 0 && diffCount === 0) {
      setShowOnlyDiff(false);
    }
  }, [allSnapshots, diffCount, showOnlyDiff]);

  // Scroll active thumbnail into view
  useEffect(() => {
    if (sidebarRef.current) {
      const el = sidebarRef.current.querySelector(`[data-idx="${activeIdx}"]`);
      el?.scrollIntoView({ block: 'nearest' });
    }
    setDiffOverlay(false);
    setDiffRaw(false);
    setDiffZoom(defaultZoom());
    setSplitZoom(1);

    if (leftPanelRef.current) leftPanelRef.current.scrollTop = 0;
    if (rightPanelRef.current) rightPanelRef.current.scrollTop = 0;
  }, [activeIdx]);

  // Preload next 3 snapshots so they're cached when the user navigates to them
  useEffect(() => {
    [1, 2, 3].forEach((offset) => {
      const snap = filtered[activeIdx + offset];
      if (!snap) return;
      preloadImage(imgUrl(snap.a));
      preloadImage(imgUrl(snap.b));
    });
  }, [activeIdx, filtered]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filtered.length]);

  const active = filtered[activeIdx] ?? null;

  const goPrev = () => setActiveIdx((i) => Math.max(i - 1, 0));
  const goNext = () => setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));

  const bg = dark ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900';
  const sideBg = dark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200';
  const barBg = dark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200';
  const activeTile = dark ? 'bg-blue-900 border-l-4 border-blue-400' : 'bg-blue-50 border-l-4 border-blue-500';
  const hoverTile = dark ? 'hover:bg-gray-700' : 'hover:bg-gray-100';

  return (
    <div className={`flex overflow-hidden ${bg}`} style={{ height: 'calc(100vh - 64px)' }}>
      {/* ── Sidebar ── */}
      <aside
        className={`flex flex-col flex-shrink-0 border-r overflow-hidden transition-all duration-200 ${sideBg}`}
        style={{ width: sidebarOpen ? 240 : 0 }}
      >
        {/* Stats */}
        <div className={`p-3 border-b ${dark ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="text-xs text-gray-500 truncate">{timestamp}</div>
          <div className="mt-1 flex gap-3 text-sm">
            <span className="font-semibold">{allSnapshots.length} snapshots</span>
            {diffCount > 0 && <span className="text-red-500 font-semibold">{diffCount} diffs</span>}
          </div>
        </div>

        {/* Filters */}
        <div className={`p-3 border-b ${dark ? 'border-gray-700' : 'border-gray-200'} space-y-3`}>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showOnlyDiff}
              onChange={(e) => setShowOnlyDiff(e.target.checked)}
              className="rounded"
            />
            Show diffs only
          </label>

          {browsers.length > 1 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
                Browsers
              </div>
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => setActiveBrowser(null)}
                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                    !activeBrowser
                      ? 'bg-blue-500 text-white border-blue-500'
                      : dark
                        ? 'border-gray-600 text-gray-300 hover:border-gray-400'
                        : 'border-gray-300 text-gray-600 hover:border-gray-400'
                  }`}
                >
                  All
                </button>
                {browsers.map((b) => (
                  <button
                    key={b}
                    onClick={() => setActiveBrowser(b === activeBrowser ? null : b)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                      activeBrowser === b
                        ? 'bg-blue-500 text-white border-blue-500'
                        : dark
                          ? 'border-gray-600 text-gray-300 hover:border-gray-400'
                          : 'border-gray-300 text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Snapshot list */}
        <div className="flex-1 overflow-y-auto" ref={sidebarRef}>
          {filtered.length === 0 ? (
            <div className="p-4 text-sm text-gray-400 text-center">No snapshots match filters</div>
          ) : (
            filtered.map((snap, i) => (
              <button
                key={snap.id}
                data-idx={i}
                onClick={() => setActiveIdx(i)}
                className={`w-full text-left flex gap-2 items-start p-2 border-b transition-colors ${
                  dark ? 'border-gray-700' : 'border-gray-100'
                } ${i === activeIdx ? activeTile : hoverTile}`}
              >
                {/* Thumbnail */}
                <div
                  className="flex-shrink-0 rounded overflow-hidden bg-gray-200"
                  style={{ width: 48, height: 40 }}
                >
                  <Thumb src={imgUrl(snap.b || snap.a)} />
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate leading-tight">
                    {snap.urlA ? getPathSlug(snap.urlA) : snap.category}
                  </div>
                  <div className="text-xs text-gray-500 truncate mt-0.5">{deviceLabel(snap.browser)}</div>
                  {snap.hasDiff && (
                    <span className="inline-block mt-0.5 text-xs bg-red-100 text-red-600 px-1.5 rounded-full">
                      diff
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* ── Main panel ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {active ? (
          <>
            {/* Top nav bar */}
            <div className={`flex items-center gap-1.5 px-3 py-1 border-b flex-shrink-0 ${barBg}`}>
              {/* Sidebar toggle */}
              <button
                onClick={() => setSidebarOpen((v) => !v)}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 flex-shrink-0"
                aria-label="Toggle sidebar"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              {/* Prev / Next */}
              <button
                onClick={goPrev}
                disabled={activeIdx === 0}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 disabled:opacity-30 text-base leading-none"
                aria-label="Previous"
              >
                ‹
              </button>
              <span className="text-xs font-mono tabular-nums w-12 text-center">
                {activeIdx + 1}/{filtered.length}
              </span>
              <button
                onClick={goNext}
                disabled={activeIdx === filtered.length - 1}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 disabled:opacity-30 text-base leading-none"
                aria-label="Next"
              >
                ›
              </button>

              {/* URLs */}
              <div className="flex items-center gap-1.5 flex-1 min-w-0 mx-1 text-xs overflow-hidden">
                {active.urlA && (
                  <a
                    href={active.urlA}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-blue-500 hover:underline min-w-0 shrink"
                    title={active.urlA}
                  >
                    {active.urlA}
                  </a>
                )}
                {active.urlB && active.urlB !== active.urlA && (
                  <>
                    <span className="text-gray-400 flex-shrink-0">→</span>
                    <a
                      href={active.urlB}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-blue-500 hover:underline min-w-0 shrink"
                      title={active.urlB}
                    >
                      {active.urlB}
                    </a>
                  </>
                )}
              </div>

              {/* Diff badge */}
              {active.hasDiff ? (
                <span className="flex-shrink-0 text-xs bg-red-100 text-red-600 px-1.5 py-px rounded-full font-medium">
                  DIFF
                </span>
              ) : (
                <span className="flex-shrink-0 text-xs bg-green-100 text-green-700 px-1.5 py-px rounded-full font-medium">
                  MATCH
                </span>
              )}

              {/* View mode toggle */}
              <div
                className={`flex rounded overflow-hidden border ml-1 flex-shrink-0 ${dark ? 'border-gray-600' : 'border-gray-300'}`}
              >
                {['split', 'slider', 'diff'].map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={`text-xs px-2 py-px transition-colors ${
                      viewMode === mode
                        ? 'bg-blue-500 text-white'
                        : dark
                          ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {/* Comparison area — overflow-y-auto on each column independently */}
            <div className="flex-1 overflow-hidden">
              {viewMode === 'split' && (
                <div className="flex h-full relative">
                  {/* Baseline */}
                  <div
                    ref={leftPanelRef}
                    onScroll={syncScroll('left', rightPanelRef)}
                    className="flex-1 overflow-auto border-r"
                  >
                    <div
                      className={`py-1 px-2 sticky top-0 z-10 ${
                        dark ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      <div className="text-xs font-semibold">Baseline</div>
                      {active.urlA && (
                        <a href={active.urlA} target="_blank" rel="noreferrer"
                          className="text-xs text-blue-500 hover:underline truncate block" title={active.urlA}>
                          {active.urlA} ↗
                        </a>
                      )}
                    </div>
                    <img src={imgUrl(active.a)} alt="baseline" className="block"
                      style={{ width: `${splitZoom * 100}%`, maxWidth: splitZoom > 1 ? 'none' : '100%' }} />
                  </div>
                  {/* New */}
                  <div
                    ref={rightPanelRef}
                    onScroll={syncScroll('right', leftPanelRef)}
                    className={`flex-1 overflow-auto ${active.hasDiff ? 'outline outline-2 outline-red-400' : ''}`}
                  >
                    <div
                      className={`py-1 px-2 sticky top-0 z-10 ${
                        dark ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      <div className="text-xs font-semibold">
                        New {active.hasDiff && <span className="text-red-500 ml-1">●</span>}
                      </div>
                      {active.urlB && (
                        <a href={active.urlB} target="_blank" rel="noreferrer"
                          className="text-xs text-blue-500 hover:underline truncate block" title={active.urlB}>
                          {active.urlB} ↗
                        </a>
                      )}
                    </div>
                    <div
                      className="relative"
                      style={{
                        cursor: active.diff ? 'pointer' : 'default',
                        background: diffOverlay && active.diff ? '#1a1a1a' : 'transparent',
                        isolation: diffOverlay && active.diff ? 'isolate' : 'auto',
                      }}
                      onClick={() => active.diff && setDiffOverlay((v) => !v)}
                      title={active.diff ? (diffOverlay ? 'Click to hide diff overlay' : 'Click to show diff overlay') : undefined}
                    >
                      <img
                        src={imgUrl(active.b)}
                        alt="new"
                        className="block"
                        style={{
                          width: `${splitZoom * 100}%`,
                          maxWidth: splitZoom > 1 ? 'none' : '100%',
                          opacity: diffOverlay && active.diff ? 0.2 : 1,
                        }}
                      />
                      {diffOverlay && active.diff && (
                        <img
                          src={imgUrl(active.diff)}
                          alt="diff overlay"
                          className="absolute inset-0 w-full h-full pointer-events-none"
                          style={{ filter: 'invert(1) hue-rotate(180deg) saturate(8)', mixBlendMode: 'screen' }}
                        />
                      )}
                      {active.diff && (
                        <span className={`absolute top-2 right-2 text-xs px-1.5 py-px rounded font-medium pointer-events-none ${
                          diffOverlay ? 'bg-red-500 text-white' : 'bg-black/40 text-white'
                        }`}>
                          {diffOverlay ? 'diff on' : 'diff'}
                        </span>
                      )}
                    </div>
                  </div>
                  <ZoomControls
                    zoom={splitZoom}
                    setZoom={setSplitZoom}
                    getResetZoom={() => 1}
                    className="absolute bottom-3 right-3 z-20"
                  />
                </div>
              )}

              {viewMode === 'slider' && (
                <div className="p-4">
                  {imgUrl(active.a) && imgUrl(active.b) ? (
                    <ReactCompareImage
                      leftImage={imgUrl(active.a)}
                      rightImage={imgUrl(active.b)}
                      leftImageLabel="Baseline"
                      rightImageLabel="New"
                    />
                  ) : (
                    <div className="text-gray-400 text-center mt-8">
                      Both images required for slider view
                    </div>
                  )}
                </div>
              )}

              {viewMode === 'diff' && (
                <div
                  className="relative overflow-auto h-full"
                  style={{ background: diffRaw ? 'transparent' : '#1a1a1a', isolation: 'isolate' }}
                >
                  {active.diff ? (
                    <div className="p-2 sm:p-4">
                      <img
                        src={diffRaw ? imgUrl(active.b) : imgUrl(active.diff)}
                        alt="diff"
                        onClick={() => setDiffRaw((v) => !v)}
                        className="block mx-auto"
                        style={{
                          width: `${diffZoom * 100}%`,
                          maxWidth: diffZoom > 1 ? 'none' : '100%',
                          ...(diffRaw ? {} : {
                            filter: 'invert(1) hue-rotate(180deg) saturate(8)',
                            mixBlendMode: 'screen',
                          }),
                          cursor: 'pointer',
                        }}
                        title={diffRaw ? 'Click to show diff overlay' : 'Click to hide overlay'}
                      />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-400">No differences found</div>
                  )}
                  {active.diff && (
                    <ZoomControls
                      zoom={diffZoom}
                      setZoom={setDiffZoom}
                      getResetZoom={defaultZoom}
                      className="absolute top-3 right-3"
                    />
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              className={`flex items-center px-4 py-1.5 border-t text-xs flex-shrink-0 ${barBg} ${dark ? 'text-gray-400' : 'text-gray-500'}`}
            >
              <span className="truncate">{active.category}</span>
              <span className="ml-auto flex-shrink-0">order: {active.order}</span>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-gray-400 text-sm">
            {allSnapshots.length === 0 ? (
              <>
                <span>No data loaded — results.json may still be uploading to S3.</span>
                <button
                  onClick={() => window.location.reload()}
                  className="text-blue-500 hover:underline text-xs"
                >
                  Retry
                </button>
              </>
            ) : (
              <>
                <span>No snapshots match the current filters.</span>
                <button
                  onClick={() => { setShowOnlyDiff(false); setActiveBrowser(null); }}
                  className="text-blue-500 hover:underline text-xs"
                >
                  Show all {allSnapshots.length} snapshots
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageDiff;
