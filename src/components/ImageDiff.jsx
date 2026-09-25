import { useState, useMemo, useEffect, useRef, useCallback } from 'react';

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

// Same file, but via the same-origin /api proxy (already used for results.json)
// instead of the absolute S3 host. S3 sends no Access-Control-Allow-Origin
// header, so a canvas fed from the absolute URL is "tainted" and getImageData
// throws — routing through /api keeps the request same-origin so we can read
// pixels client-side for diff-hotspot detection below.
const apiImgUrl = (p) => {
  if (!p) return null;
  const encoded = p.split('/').map(encodeURIComponent).join('/');
  return `/api/milo/${encoded}`;
};

// Scan a diff.png (produced by Playwright's pixelmatch: unchanged pixels are
// grayscale, changed pixels are reddish) for vertical bands that contain
// differences, so users can jump straight to them instead of scrolling
// through a 5000-7400px full-page screenshot looking for red pixels.
const analyzeDiffHotspots = async (url) => {
  const res = await fetch(url);
  if (!res.ok) return { naturalWidth: 0, naturalHeight: 0, hotspots: [], density: [] };
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);
  const { width: naturalWidth, height: naturalHeight } = bitmap;

  // Downscale before scanning — a 1920x7400 image is ~14M pixels, far more
  // than we need to know *which rows* contain diff pixels.
  const ANALYZE_WIDTH = 240;
  const scale = Math.min(1, ANALYZE_WIDTH / naturalWidth);
  const w = Math.max(1, Math.round(naturalWidth * scale));
  const h = Math.max(1, Math.round(naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const rowDiffCount = new Array(h).fill(0);
  for (let y = 0; y < h; y++) {
    let count = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // pixelmatch's default diff color is opaque red; unchanged pixels stay
      // grayscale (r === g === b), so "reddish" reliably flags a diff pixel.
      if (r > g + 30 && r > b + 30) count += 1;
    }
    rowDiffCount[y] = count;
  }

  // Cluster contiguous (with small gap tolerance) diff rows into bands.
  const GAP_TOLERANCE = 2;
  const MIN_BAND_ROWS = 2;
  const clusters = [];
  let start = -1;
  let gap = 0;
  let bandPixels = 0;
  for (let y = 0; y < h; y++) {
    if (rowDiffCount[y] > 0) {
      if (start === -1) { start = y; bandPixels = 0; }
      bandPixels += rowDiffCount[y];
      gap = 0;
    } else if (start !== -1) {
      gap += 1;
      if (gap > GAP_TOLERANCE) {
        clusters.push({ start, end: y - gap, bandPixels });
        start = -1;
      }
    }
  }
  if (start !== -1) clusters.push({ start, end: h - 1, bandPixels });

  const hotspots = clusters
    .filter((c) => c.end - c.start + 1 >= MIN_BAND_ROWS)
    .map((c) => ({
      y0: Math.round(c.start / scale),
      y1: Math.round((c.end + 1) / scale),
      score: c.bandPixels,
    }))
    .sort((a, b) => a.y0 - b.y0)
    .slice(0, 40);

  // Per-row diff density (0..1, fraction of the scanned width that differed)
  // for the minimap strip — a full-height "where are the changes" overview,
  // distinct from the hotspot list above which only surfaces discrete bands.
  const density = rowDiffCount.map((count) => count / w);

  return { naturalWidth, naturalHeight, hotspots, density };
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

// Full-page "code-editor style" density strip: renders one pixel per scanned
// row of diff.png (grayscale -> red as diff density rises) so users can see
// at a glance *where* changes cluster across a 5000-7000px screenshot, plus
// a draggable viewport indicator to jump anywhere in one click — a broader,
// continuous complement to the discrete hotspot prev/next navigator above.
const Minimap = ({ dark, density, viewportTop, viewportHeight, onSeek }) => {
  const canvasRef = useRef(null);
  const trackRef = useRef(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !density.length) return;
    canvas.width = 1;
    canvas.height = density.length;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(1, density.length);
    const base = dark ? 60 : 220;
    for (let y = 0; y < density.length; y++) {
      const t = Math.min(1, density[y]);
      imgData.data[y * 4] = Math.round(base + t * (255 - base));
      imgData.data[y * 4 + 1] = Math.round(base * (1 - t * 0.9));
      imgData.data[y * 4 + 2] = Math.round(base * (1 - t * 0.9));
      imgData.data[y * 4 + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
  }, [density, dark]);

  const seekFromClientY = useCallback((clientY) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || !rect.height) return;
    onSeek((clientY - rect.top) / rect.height);
  }, [onSeek]);

  useEffect(() => {
    const onMove = (e) => draggingRef.current && seekFromClientY(e.clientY);
    const onUp = () => { draggingRef.current = false; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [seekFromClientY]);

  return (
    <div
      ref={trackRef}
      className={`absolute top-0 right-0 bottom-0 w-4 z-20 cursor-ns-resize select-none border-l ${
        dark ? 'border-gray-700 bg-gray-900/70' : 'border-gray-300 bg-white/80'
      }`}
      title="Diff density map — click or drag to jump"
      onPointerDown={(e) => { draggingRef.current = true; seekFromClientY(e.clientY); }}
    >
      <canvas ref={canvasRef} className="w-full h-full block" />
      <div
        className="absolute left-0 right-0 bg-blue-400/30 border-y-2 border-blue-400 pointer-events-none"
        style={{ top: `${viewportTop * 100}%`, height: `${Math.max(1, viewportHeight * 100)}%` }}
      />
    </div>
  );
};

// Slider comparison that keeps both images at their own natural aspect ratio
// (unlike react-compare-image, which stretches the shorter image with
// object-fit: cover to match the taller one's height — causing baseline/new
// content to drift out of vertical alignment whenever page heights differ,
// which is common for real full-page screenshots).
const NaturalCompareSlider = ({
  leftImage, rightImage, leftLabel, rightLabel, zoom = 1, diffImage, showDiff, onToggleDiff, flashBand,
}) => {
  const containerRef = useRef(null);
  const leftImgRef = useRef(null);
  const rightImgRef = useRef(null);
  const draggingRef = useRef(false);
  const [pos, setPos] = useState(50);
  const [heights, setHeights] = useState({ left: 0, right: 0 });
  const [renderWidth, setRenderWidth] = useState(0);

  const recompute = useCallback(() => {
    // Measure the scrollable wrapper (not this container itself, whose width
    // changes with zoom) so zooming in/out keeps the base width stable.
    const baseWidth = containerRef.current?.parentElement?.clientWidth || 0;
    const width = Math.max(0, baseWidth * zoom);
    const l = leftImgRef.current;
    const r = rightImgRef.current;
    setRenderWidth(width);
    setHeights({
      left: l?.naturalWidth ? (l.naturalHeight / l.naturalWidth) * width : 0,
      right: r?.naturalWidth ? (r.naturalHeight / r.naturalWidth) * width : 0,
    });
  }, [zoom]);

  useEffect(() => {
    recompute();
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  }, [recompute, leftImage, rightImage]);

  const updatePosFromClientX = (clientX) => {
    const rect = containerRef.current.getBoundingClientRect();
    setPos(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
  };

  useEffect(() => {
    const onMove = (e) => draggingRef.current && updatePosFromClientX(e.clientX);
    const onUp = () => { draggingRef.current = false; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  const height = Math.max(heights.left, heights.right);
  // Flag when baseline/new have meaningfully different natural heights — a
  // fixed-width scale factor means content beyond the shorter image's end is
  // just blank, not a real content difference, so this needs to be obvious.
  const mismatchPx = Math.round(Math.abs(heights.left - heights.right));
  const showMismatch = heights.left > 0 && heights.right > 0 && mismatchPx > 4;
  const mismatchY = Math.min(heights.left, heights.right);
  const shorterLabel = heights.left < heights.right ? leftLabel : rightLabel;

  return (
    <div
      ref={containerRef}
      className="relative select-none"
      style={{ height: height || undefined, width: renderWidth || undefined }}
    >
      <img
        ref={leftImgRef}
        src={leftImage}
        alt={leftLabel}
        onLoad={recompute}
        className="absolute top-0 left-0 w-full block"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      />
      <img
        ref={rightImgRef}
        src={rightImage}
        alt={rightLabel}
        onLoad={recompute}
        className="absolute top-0 left-0 w-full block"
        style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
      />
      {showDiff && diffImage && (
        <img
          src={diffImage}
          alt="diff"
          className="absolute top-0 left-0 w-full block pointer-events-none"
          style={{ filter: 'invert(1) hue-rotate(180deg) saturate(8)', mixBlendMode: 'screen', zIndex: 5 }}
        />
      )}
      {showMismatch && (
        <>
          <div
            className="absolute left-0 right-0 border-t-2 border-dashed border-yellow-400 pointer-events-none z-20"
            style={{ top: mismatchY }}
          />
          <div
            className="absolute text-xs bg-yellow-500 text-black px-2 py-0.5 rounded pointer-events-none z-20 font-medium whitespace-nowrap"
            style={{ top: mismatchY + 4, left: '50%', transform: 'translateX(-50%)' }}
          >
            ⚠ {shorterLabel} ends here — heights differ by {mismatchPx}px (blank below)
          </div>
        </>
      )}
      {flashBand && (
        <div
          className="absolute left-0 right-0 border-2 border-yellow-400 bg-yellow-300/30 pointer-events-none z-10 animate-pulse"
          style={{ top: flashBand.top, height: flashBand.height }}
        />
      )}
      <div className="absolute top-2 left-2 text-xs bg-black/50 text-white px-2 py-1 rounded pointer-events-none z-20">
        {leftLabel}
      </div>
      <div className="absolute top-2 right-2 text-xs bg-black/50 text-white px-2 py-1 rounded pointer-events-none z-20">
        {rightLabel}
      </div>
      {diffImage && (
        <button
          onClick={onToggleDiff}
          className="absolute top-2 left-1/2 -translate-x-1/2 text-xs bg-black/50 text-white px-2 py-1 rounded z-30 hover:bg-black/70"
        >
          {showDiff ? 'Hide diff overlay' : 'Show diff overlay'}
        </button>
      )}
      <div
        className="absolute top-0 bottom-0 flex items-center justify-center cursor-ew-resize z-20"
        style={{ left: `${pos}%`, transform: 'translateX(-50%)', width: 32 }}
        onPointerDown={(e) => { draggingRef.current = true; updatePosFromClientX(e.clientX); e.preventDefault(); }}
      >
        <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-white shadow -translate-x-1/2" />
        <div className="w-8 h-8 rounded-full bg-white shadow flex items-center justify-center text-gray-500 text-xs">
          ↔
        </div>
      </div>
    </div>
  );
};

// "Blink" (a.k.a. onion-skin / flicker) comparison: same position, same
// scale, alternating baseline <-> new at a fixed interval. The eye is far
// more sensitive to something *changing in place* than to spot-the-
// difference across two side-by-side or slider-clipped images, so this
// surfaces subtle shifts (a few px of movement, a slightly different font
// weight, a recolored icon) that split/slider view can visually mask.
const BlinkCompare = ({ leftImage, rightImage, leftLabel, rightLabel, zoom = 1 }) => {
  const containerRef = useRef(null);
  const leftImgRef = useRef(null);
  const rightImgRef = useRef(null);
  const [showRight, setShowRight] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [intervalMs, setIntervalMs] = useState(500);
  const [renderWidth, setRenderWidth] = useState(0);
  const [height, setHeight] = useState(0);

  const recompute = useCallback(() => {
    const baseWidth = containerRef.current?.parentElement?.clientWidth || 0;
    const width = Math.max(0, baseWidth * zoom);
    const l = leftImgRef.current;
    const r = rightImgRef.current;
    setRenderWidth(width);
    // Use whichever image is taller so neither ever gets clipped — unlike
    // the slider, both images are fully shown here (just not at the same
    // time), so there's no "shorter image ends here" ambiguity to warn about.
    const lh = l?.naturalWidth ? (l.naturalHeight / l.naturalWidth) * width : 0;
    const rh = r?.naturalWidth ? (r.naturalHeight / r.naturalWidth) * width : 0;
    setHeight(Math.max(lh, rh));
  }, [zoom]);

  useEffect(() => {
    recompute();
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  }, [recompute, leftImage, rightImage]);

  useEffect(() => {
    if (!playing) return undefined;
    const id = window.setInterval(() => setShowRight((v) => !v), intervalMs);
    return () => window.clearInterval(id);
  }, [playing, intervalMs]);

  return (
    <div
      ref={containerRef}
      className="relative select-none"
      style={{ height: height || undefined, width: renderWidth || undefined }}
    >
      <img
        ref={leftImgRef}
        src={leftImage}
        alt={leftLabel}
        onLoad={recompute}
        className="absolute top-0 left-0 w-full block"
        style={{ opacity: showRight ? 0 : 1 }}
      />
      <img
        ref={rightImgRef}
        src={rightImage}
        alt={rightLabel}
        onLoad={recompute}
        className="absolute top-0 left-0 w-full block"
        style={{ opacity: showRight ? 1 : 0 }}
      />
      <div className="absolute top-2 left-2 text-xs bg-black/50 text-white px-2 py-1 rounded pointer-events-none z-20">
        {showRight ? rightLabel : leftLabel}
      </div>
      <div className="absolute top-2 right-2 flex items-center gap-1 z-20">
        <button
          onClick={() => setPlaying((v) => !v)}
          className="text-xs bg-black/50 text-white px-2 py-1 rounded hover:bg-black/70"
        >
          {playing ? '⏸ pause' : '▶ play'}
        </button>
        <button
          onClick={() => { setPlaying(false); setShowRight((v) => !v); }}
          className="text-xs bg-black/50 text-white px-2 py-1 rounded hover:bg-black/70"
          title="Manually toggle baseline/new"
        >
          ⇄ toggle
        </button>
        <select
          value={intervalMs}
          onChange={(e) => setIntervalMs(Number(e.target.value))}
          className="text-xs bg-black/50 text-white px-1 py-1 rounded"
          title="Blink speed"
        >
          <option value={200}>fast</option>
          <option value={500}>medium</option>
          <option value={1000}>slow</option>
        </select>
      </div>
    </div>
  );
};

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
  const [sliderZoom, setSliderZoom] = useState(1);
  const [sliderDiffOn, setSliderDiffOn] = useState(false);
  const [blinkZoom, setBlinkZoom] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);
  const [hotspots, setHotspots] = useState([]);
  const [hotspotIdx, setHotspotIdx] = useState(0);
  const [hotspotsLoading, setHotspotsLoading] = useState(false);
  const [diffNaturalSize, setDiffNaturalSize] = useState({ width: 0, height: 0 });
  const [flashHotspot, setFlashHotspot] = useState(null);
  const [diffDensity, setDiffDensity] = useState([]);
  const [viewportRatio, setViewportRatio] = useState({ top: 0, height: 1 });
  const sidebarRef = useRef(null);
  const leftPanelRef = useRef(null);
  const rightPanelRef = useRef(null);
  const sliderScrollRef = useRef(null);
  const diffScrollRef = useRef(null);
  const blinkScrollRef = useRef(null);
  const scrollingRef = useRef(null); // tracks which panel initiated scroll to avoid loops
  const hotspotCacheRef = useRef(new Map());

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
    setSliderZoom(1);
    setSliderDiffOn(false);
    setBlinkZoom(1);

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

  // Detect diff hotspots (bands of the page with actual pixel differences) so
  // the user can jump straight to them instead of scrolling a full-page image.
  useEffect(() => {
    setHotspots([]);
    setHotspotIdx(0);
    setDiffNaturalSize({ width: 0, height: 0 });
    setFlashHotspot(null);
    setDiffDensity([]);
    if (!active?.diff) return undefined;

    const cached = hotspotCacheRef.current.get(active.diff);
    if (cached) {
      setHotspots(cached.hotspots);
      setDiffNaturalSize({ width: cached.naturalWidth, height: cached.naturalHeight });
      setDiffDensity(cached.density);
      return undefined;
    }

    let cancelled = false;
    setHotspotsLoading(true);
    analyzeDiffHotspots(apiImgUrl(active.diff))
      .then((result) => {
        if (cancelled) return;
        hotspotCacheRef.current.set(active.diff, result);
        setHotspots(result.hotspots);
        setDiffNaturalSize({ width: result.naturalWidth, height: result.naturalHeight });
        setDiffDensity(result.density);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setHotspotsLoading(false);
      });
    return () => { cancelled = true; };
  }, [active?.diff]);

  // Scroll whichever view is active to a given natural-pixel Y range in
  // diff.png (all three views share the same top-left-aligned coordinate
  // space, since Playwright pads the smaller image rather than cropping).
  // Returns the on-screen pixel {top, height} of the band *for the slider
  // view only* (its image container has no padding, so the math is exact —
  // split/diff views wrap their image in padded containers, so a precise
  // highlight box there isn't worth the added complexity; the scroll itself
  // is still accurate up to a few px of padding).
  const scrollActiveViewToY = useCallback((y0, y1) => {
    const { width: naturalWidth } = diffNaturalSize;
    if (!naturalWidth) return null;

    const doScroll = (el, zoom) => {
      if (!el) return null;
      const scale = (el.clientWidth * zoom) / naturalWidth;
      const top = y0 * scale;
      const bottom = y1 * scale;
      const target = top - el.clientHeight / 3;
      el.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
      return { top, height: Math.max(4, bottom - top) };
    };

    if (viewMode === 'slider') return doScroll(sliderScrollRef.current, sliderZoom);
    if (viewMode === 'diff') return doScroll(diffScrollRef.current, diffZoom);
    if (viewMode === 'blink') return doScroll(blinkScrollRef.current, blinkZoom);
    if (viewMode === 'split') {
      doScroll(leftPanelRef.current, splitZoom);
      doScroll(rightPanelRef.current, splitZoom);
    }
    return null;
  }, [viewMode, diffNaturalSize, sliderZoom, diffZoom, blinkZoom, splitZoom]);

  const flashTimeoutRef = useRef(null);
  const jumpToHotspot = useCallback((idx) => {
    const spot = hotspots[idx];
    if (!spot) return;
    setHotspotIdx(idx);
    const rect = scrollActiveViewToY(spot.y0, spot.y1);
    setFlashHotspot(viewMode === 'slider' && rect ? rect : null);
    window.clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = window.setTimeout(() => setFlashHotspot(null), 1200);
  }, [hotspots, scrollActiveViewToY, viewMode]);

  // Track which scroll container represents "the" current view per mode, so
  // the minimap's viewport indicator and its click/drag seeking both target
  // the right element without duplicating per-mode branching everywhere.
  const activeScrollEl = useCallback(() => {
    if (viewMode === 'slider') return sliderScrollRef.current;
    if (viewMode === 'diff') return diffScrollRef.current;
    if (viewMode === 'blink') return blinkScrollRef.current;
    return rightPanelRef.current;
  }, [viewMode]);

  // Keep the minimap's viewport indicator in sync with actual scroll
  // position — scrollTop/scrollHeight ratios line up with the diff image's
  // natural-pixel Y position regardless of zoom, since the whole page is
  // rendered at one uniform scale, so no extra unit conversion is needed.
  useEffect(() => {
    const el = activeScrollEl();
    if (!el) return undefined;
    const update = () => {
      const total = el.scrollHeight || 1;
      setViewportRatio({ top: el.scrollTop / total, height: Math.min(1, el.clientHeight / total) });
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [activeScrollEl, activeIdx, splitZoom, sliderZoom, diffZoom, blinkZoom]);

  // Minimap click/drag-to-jump: unlike jumpToHotspot (which targets a known
  // natural-pixel band), this seeks by scroll-ratio, so it works anywhere on
  // the page — not just at detected hotspots.
  const seekToRatio = useCallback((ratio) => {
    const clamped = Math.max(0, Math.min(1, ratio));
    const scrollTo = (el) => {
      if (!el) return;
      el.scrollTo({ top: clamped * el.scrollHeight, behavior: 'auto' });
    };
    if (viewMode === 'split') {
      scrollTo(leftPanelRef.current);
      scrollTo(rightPanelRef.current);
    } else {
      scrollTo(activeScrollEl());
    }
  }, [viewMode, activeScrollEl]);

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
                {['split', 'slider', 'blink', 'diff'].map((mode) => (
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

              {/* Diff hotspot navigator — jump straight to detected diff bands
                  instead of scrolling a full-page screenshot looking for them */}
              {active.diff && (hotspotsLoading || hotspots.length > 0) && (
                <div
                  className={`flex items-center gap-1 rounded border ml-1 px-1.5 py-px flex-shrink-0 ${
                    dark ? 'border-gray-600 bg-gray-700' : 'border-gray-300 bg-white'
                  }`}
                  title="Detected diff hotspots"
                >
                  {hotspotsLoading ? (
                    <span className="text-xs text-gray-400">scanning…</span>
                  ) : (
                    <>
                      <button
                        onClick={() => jumpToHotspot((hotspotIdx - 1 + hotspots.length) % hotspots.length)}
                        className={`text-xs px-1 ${dark ? 'text-gray-300 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}
                        title="Previous hotspot"
                        aria-label="Previous hotspot"
                      >
                        ‹
                      </button>
                      <span className="text-xs whitespace-nowrap select-none">
                        🔥 {hotspotIdx + 1}/{hotspots.length}
                      </span>
                      <button
                        onClick={() => jumpToHotspot((hotspotIdx + 1) % hotspots.length)}
                        className={`text-xs px-1 ${dark ? 'text-gray-300 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}
                        title="Next hotspot"
                        aria-label="Next hotspot"
                      >
                        ›
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Comparison area — overflow-y-auto on each column independently */}
            <div className="flex-1 overflow-hidden relative">
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
                    className="absolute bottom-3 right-6 z-20"
                  />
                </div>
              )}

              {viewMode === 'slider' && (
                <div className="h-full relative">
                  <div ref={sliderScrollRef} className="p-4 h-full overflow-auto">
                    {imgUrl(active.a) && imgUrl(active.b) ? (
                      <NaturalCompareSlider
                        leftImage={imgUrl(active.a)}
                        rightImage={imgUrl(active.b)}
                        leftLabel="Baseline"
                        rightLabel="New"
                        zoom={sliderZoom}
                        diffImage={active.diff ? imgUrl(active.diff) : null}
                        showDiff={sliderDiffOn}
                        onToggleDiff={() => setSliderDiffOn((v) => !v)}
                        flashBand={flashHotspot}
                      />
                    ) : (
                      <div className="text-gray-400 text-center mt-8">
                        Both images required for slider view
                      </div>
                    )}
                  </div>
                  {imgUrl(active.a) && imgUrl(active.b) && (
                    <ZoomControls
                      zoom={sliderZoom}
                      setZoom={setSliderZoom}
                      getResetZoom={() => 1}
                      className="absolute bottom-3 right-6 z-20"
                    />
                  )}
                </div>
              )}

              {viewMode === 'blink' && (
                <div className="h-full relative">
                  <div ref={blinkScrollRef} className="p-4 h-full overflow-auto">
                    {imgUrl(active.a) && imgUrl(active.b) ? (
                      <BlinkCompare
                        leftImage={imgUrl(active.a)}
                        rightImage={imgUrl(active.b)}
                        leftLabel="Baseline"
                        rightLabel="New"
                        zoom={blinkZoom}
                      />
                    ) : (
                      <div className="text-gray-400 text-center mt-8">
                        Both images required for blink view
                      </div>
                    )}
                  </div>
                  {imgUrl(active.a) && imgUrl(active.b) && (
                    <ZoomControls
                      zoom={blinkZoom}
                      setZoom={setBlinkZoom}
                      getResetZoom={() => 1}
                      className="absolute bottom-3 right-6 z-20"
                    />
                  )}
                </div>
              )}

              {viewMode === 'diff' && (
                <div
                  ref={diffScrollRef}
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
                      className="absolute top-3 right-6"
                    />
                  )}
                </div>
              )}

              {/* Full-page diff-density minimap — click/drag anywhere on the
                  strip to jump, complementing the discrete hotspot nav above */}
              {active.diff && diffDensity.length > 0 && (
                <Minimap
                  dark={dark}
                  density={diffDensity}
                  viewportTop={viewportRatio.top}
                  viewportHeight={viewportRatio.height}
                  onSeek={seekToRatio}
                />
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
