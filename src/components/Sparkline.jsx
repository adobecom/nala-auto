import PropTypes from 'prop-types';

// Tiny inline trend line; nulls (missing runs) are skipped.
const Sparkline = ({ values, width = 80, height = 18, className = '', title }) => {
  const pts = values.map((v, i) => [i, v]).filter(([, v]) => typeof v === 'number');
  if (pts.length < 2) return null;
  const max = Math.max(...pts.map(([, v]) => v), 0.01);
  const step = width / Math.max(1, values.length - 1);
  const d = pts.map(([i, v], n) => `${n ? 'L' : 'M'}${(i * step).toFixed(1)},${(height - 2 - (v / max) * (height - 4)).toFixed(1)}`).join(' ');
  const [li, lv] = pts[pts.length - 1];
  return (
    <svg width={width} height={height} className={className} role="img" aria-label={title}>
      {title && <title>{title}</title>}
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx={li * step} cy={height - 2 - (lv / max) * (height - 4)} r="2" fill="currentColor" />
    </svg>
  );
};

Sparkline.propTypes = {
  values: PropTypes.arrayOf(PropTypes.number),
  width: PropTypes.number,
  height: PropTypes.number,
  className: PropTypes.string,
  title: PropTypes.string,
};

export default Sparkline;
