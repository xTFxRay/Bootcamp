import { useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { formatDate } from '../format.js';

// The three dashboard charts, drawn as plain SVG (no chart library).
// Every chart has a title, a legend when it shows more than one series, a hover tooltip,
// and a "Show as table" view with the same numbers, so nothing is told by colour alone.

const dayFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const shortDay = (iso) => dayFormat.format(new Date(iso));
// Week starts are dates without a time ("2026-11-16"): read and show them as that calendar day.
const weekDay = (ymd) => dayFormat.format(new Date(`${ymd}T12:00:00`));
const weekEnd = (ymd) => dayFormat.format(new Date(new Date(`${ymd}T12:00:00`).getTime() + 6 * 86_400_000));

// Width of an element, kept up to date as it resizes, so the SVG is drawn at real pixel size.
function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

// A rounded-top bar from the baseline up: 4px corners on the data end only.
function barPath(x, y, w, h) {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

// Round a maximum up to a tidy axis top with whole-number steps: 3 -> 4, 7 -> 8, 13 -> 15.
function niceScale(max) {
  const top = Math.max(4, max);
  const step = [1, 2, 5, 10, 20, 25, 50, 100].find((s) => top / s <= 5) ?? Math.ceil(top / 5);
  return { top: Math.ceil(top / step) * step, step };
}

function Tooltip({ tip, width }) {
  if (!tip) return null;
  const left = Math.min(Math.max(tip.x, 90), Math.max(90, width - 90));
  return (
    <div className="chart-tooltip" style={{ left, top: tip.y }} role="status">
      {tip.content}
    </div>
  );
}

function ChartCard({ id, title, subtitle, legend, children, table }) {
  return (
    <section className="chart-card" aria-labelledby={id}>
      <div className="chart-head">
        <div>
          <h3 id={id}>{title}</h3>
          {subtitle && <p className="muted small">{subtitle}</p>}
        </div>
        {legend}
      </div>
      {children}
      {table && (
        <details className="chart-table">
          <summary>Show as table</summary>
          {table}
        </details>
      )}
    </section>
  );
}

function ChartEmpty({ children, action }) {
  return (
    <div className="chart-empty">
      <p>{children}</p>
      {action && <Link to={action.href}>{action.text} →</Link>}
    </div>
  );
}

// --- 1. Pass rate over the last 10 runs ----------------------------------------

export function PassRateTrendChart({ runs, emptyAction }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const navigate = useNavigate();

  const height = 220;
  const m = { top: 14, right: 18, bottom: 40, left: 44 };
  const plotW = Math.max(0, width - m.left - m.right);
  const plotH = height - m.top - m.bottom;
  const n = runs.length;
  const x = (i) => m.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (pct) => m.top + plotH - (pct / 100) * plotH;
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 64))));

  // Runs with no passed or failed cases have no pass rate: the line breaks there.
  const segments = [];
  let current = [];
  runs.forEach((r, i) => {
    if (r.passRate === null) {
      if (current.length) segments.push(current);
      current = [];
    } else current.push(`${x(i)},${y(r.passRate)}`);
  });
  if (current.length) segments.push(current);

  const hoveredRun = hover === null ? null : runs[hover];
  const tip = hoveredRun && {
    x: x(hover),
    y: (hoveredRun.passRate === null ? y(0) : y(hoveredRun.passRate)) - 14,
    content: (
      <>
        <strong>{hoveredRun.suiteName}</strong> <span className="muted">#{hoveredRun.runId}</span>
        <div className="muted">{formatDate(hoveredRun.date)}</div>
        <div className="chart-tooltip-value">
          {hoveredRun.passRate === null ? 'No pass rate' : `${hoveredRun.passRate}% pass rate`}
        </div>
        <div>{hoveredRun.passed} passed · {hoveredRun.failed} failed · {hoveredRun.skipped} skipped</div>
        {hoveredRun.status === 'in-progress' && <div className="muted">Run not finished yet</div>}
      </>
    ),
  };

  const table = (
    <table>
      <thead><tr><th>Run</th><th>Date</th><th className="num">Pass rate</th><th className="num">Passed</th><th className="num">Failed</th><th className="num">Skipped</th></tr></thead>
      <tbody>
        {runs.map((r) => (
          <tr key={r.runId}>
            <td><Link to={`/test-runs/${r.runId}`}>{r.suiteName} #{r.runId}</Link></td>
            <td className="nowrap">{formatDate(r.date)}</td>
            <td className="num">{r.passRate === null ? '—' : `${r.passRate}%`}</td>
            <td className="num">{r.passed}</td><td className="num">{r.failed}</td><td className="num">{r.skipped}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartCard
      id="chart-pass-rate"
      title="Pass rate, last 10 test runs"
      subtitle="Passed ÷ (passed + failed) for each run, oldest on the left. Skipped cases don't count."
      table={n > 0 && table}
    >
      {n === 0 ? (
        <ChartEmpty action={emptyAction}>No test runs yet. Each run you do adds a point here.</ChartEmpty>
      ) : (
        <div className="chart-plot" ref={ref} onMouseLeave={() => setHover(null)}>
          {width > 0 && (
            <svg width={width} height={height} role="img" aria-label={`Pass rate for the last ${n} test runs. Use “Show as table” for the numbers.`}>
              {[0, 25, 50, 75, 100].map((t) => (
                <g key={t}>
                  <line className={t === 0 ? 'chart-baseline' : 'chart-grid'} x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} />
                  <text className="chart-axis" x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end">{t}%</text>
                </g>
              ))}
              {runs.map((r, i) =>
                (n - 1 - i) % labelEvery === 0 ? (
                  <text key={r.runId} className="chart-axis" x={x(i)} y={height - m.bottom + 18} textAnchor="middle">
                    {shortDay(r.date)}
                  </text>
                ) : null
              )}
              {hover !== null && <line className="chart-crosshair" x1={x(hover)} x2={x(hover)} y1={m.top} y2={m.top + plotH} />}
              {segments.map((pts, i) => pts.length > 1 && <polyline key={i} className="chart-line" points={pts.join(' ')} />)}
              {runs.map((r, i) =>
                r.passRate === null ? (
                  <circle key={r.runId} className="chart-point-empty" cx={x(i)} cy={y(0)} r={hover === i ? 5.5 : 4} />
                ) : (
                  <circle key={r.runId} className="chart-point" cx={x(i)} cy={y(r.passRate)} r={hover === i ? 6 : 4.5} />
                )
              )}
              {/* Hit areas: one full-height column per run, wider than the dot. Click opens the run. */}
              {runs.map((r, i) => {
                const half = n === 1 ? plotW / 2 : plotW / (n - 1) / 2;
                return (
                  <rect
                    key={r.runId}
                    className="chart-hit chart-hit-link"
                    x={x(i) - half}
                    y={m.top}
                    width={half * 2}
                    height={plotH}
                    onMouseEnter={() => setHover(i)}
                    onClick={() => navigate(`/test-runs/${r.runId}`)}
                  />
                );
              })}
            </svg>
          )}
          <Tooltip tip={tip} width={width} />
        </div>
      )}
      {runs.some((r) => r.passRate === null) && (
        <p className="chart-note muted small">
          <span className="chart-note-dot" aria-hidden="true" /> A hollow dot on the 0% line is a run with nothing passed or failed yet, so it has no pass rate.
        </p>
      )}
    </ChartCard>
  );
}

// --- 2. Bugs opened vs closed per week ---------------------------------------------

const BUG_SERIES = [
  { key: 'opened', label: 'Opened', className: 'chart-fill-1' },
  { key: 'closed', label: 'Closed', className: 'chart-fill-2' },
];

export function BugsPerWeekChart({ weeks }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);

  const height = 220;
  const m = { top: 14, right: 12, bottom: 40, left: 36 };
  const plotW = Math.max(0, width - m.left - m.right);
  const plotH = height - m.top - m.bottom;
  const { top, step } = niceScale(Math.max(0, ...weeks.flatMap((w) => [w.opened, w.closed])));
  const y = (v) => m.top + plotH - (v / top) * plotH;
  const groupW = plotW / weeks.length;
  const barW = Math.max(4, Math.min(20, (groupW * 0.62 - 2) / 2));
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const labelEvery = groupW < 44 ? 2 : 1;
  const nothing = weeks.every((w) => w.opened === 0 && w.closed === 0);

  const legend = (
    <ul className="chart-legend" aria-label="Legend">
      {BUG_SERIES.map((s) => (
        <li key={s.key}><span className={`chart-swatch ${s.className}`} aria-hidden="true" />{s.label}</li>
      ))}
    </ul>
  );

  const hovered = hover === null ? null : weeks[hover];
  const tip = hovered && {
    x: m.left + groupW * (hover + 0.5),
    y: y(Math.max(hovered.opened, hovered.closed)) - 14,
    content: (
      <>
        <strong>Week of {weekDay(hovered.weekStart)} – {weekEnd(hovered.weekStart)}</strong>
        {BUG_SERIES.map((s) => (
          <div key={s.key} className="chart-tooltip-row">
            <span className={`chart-swatch ${s.className}`} aria-hidden="true" />
            {s.label}<span className="chart-tooltip-num">{hovered[s.key]}</span>
          </div>
        ))}
      </>
    ),
  };

  const table = (
    <table>
      <thead><tr><th>Week</th><th className="num">Opened</th><th className="num">Closed</th></tr></thead>
      <tbody>
        {weeks.map((w) => (
          <tr key={w.weekStart}><td className="nowrap">{weekDay(w.weekStart)} – {weekEnd(w.weekStart)}</td><td className="num">{w.opened}</td><td className="num">{w.closed}</td></tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartCard
      id="chart-bugs-weekly"
      title="Bugs opened vs closed, last 8 weeks"
      subtitle="Weeks run Monday to Sunday. Closed counts bugs moved to “closed” that week."
      legend={legend}
      table={table}
    >
      {nothing ? (
        <ChartEmpty action={{ href: '/bugs', text: 'Go to bugs' }}>No bugs were opened or closed in the last 8 weeks.</ChartEmpty>
      ) : (
        <div className="chart-plot" ref={ref} onMouseLeave={() => setHover(null)}>
          {width > 0 && (
            <svg width={width} height={height} role="img" aria-label="Bugs opened and closed per week for the last 8 weeks. Use “Show as table” for the numbers.">
              {ticks.map((t) => (
                <g key={t}>
                  <line className={t === 0 ? 'chart-baseline' : 'chart-grid'} x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} />
                  <text className="chart-axis" x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end">{t}</text>
                </g>
              ))}
              {weeks.map((w, i) => {
                const gx = m.left + groupW * i;
                const start = gx + groupW / 2 - barW - 1; // two bars with a 2px gap, centred in the week
                return (
                  <g key={w.weekStart}>
                    {hover === i && <rect className="chart-band" x={gx + 2} y={m.top} width={groupW - 4} height={plotH} />}
                    {BUG_SERIES.map((s, j) => (
                      <path key={s.key} className={s.className} d={barPath(start + j * (barW + 2), y(w[s.key]), barW, y(0) - y(w[s.key]))} />
                    ))}
                    {(weeks.length - 1 - i) % labelEvery === 0 && (
                      <text className="chart-axis" x={gx + groupW / 2} y={height - m.bottom + 18} textAnchor="middle">
                        {weekDay(w.weekStart)}
                      </text>
                    )}
                    <rect className="chart-hit" x={gx} y={m.top} width={groupW} height={plotH} onMouseEnter={() => setHover(i)} />
                  </g>
                );
              })}
            </svg>
          )}
          <Tooltip tip={tip} width={width} />
        </div>
      )}
    </ChartCard>
  );
}

// --- 3. Test cases by status (donut) --------------------------------------------------

const STATUS_LABELS = { draft: 'Draft', ready: 'Ready', passed: 'Passed', failed: 'Failed', blocked: 'Blocked', skipped: 'Skipped' };

// Point on a circle; angle 0 is 12 o'clock, going clockwise.
const polar = (cx, cy, r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];

function arcPath(cx, cy, rOuter, rInner, a0, a1) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = polar(cx, cy, rOuter, a0);
  const [x1, y1] = polar(cx, cy, rOuter, a1);
  const [x2, y2] = polar(cx, cy, rInner, a1);
  const [x3, y3] = polar(cx, cy, rInner, a0);
  return `M${x0},${y0}A${rOuter},${rOuter} 0 ${large} 1 ${x1},${y1}L${x2},${y2}A${rInner},${rInner} 0 ${large} 0 ${x3},${y3}Z`;
}

export function CoverageDonutChart({ coverage }) {
  const [hover, setHover] = useState(null);
  const total = coverage.reduce((sum, c) => sum + c.count, 0);
  const size = 200;
  const c = size / 2;
  const rOuter = 92;
  const rInner = 62;
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);

  // Slices in the fixed status order, skipping empty ones; a 2px gap of background between slices.
  const filled = coverage.filter((s) => s.count > 0);
  const gap = filled.length > 1 ? 2 / rOuter : 0;
  let angle = 0;
  const slices = filled.map((s) => {
    const sweep = (s.count / total) * Math.PI * 2;
    const slice = { ...s, a0: angle + gap / 2, a1: angle + sweep - gap / 2 };
    angle += sweep;
    return slice;
  });

  const hovered = hover && coverage.find((s) => s.status === hover);

  const table = (
    <table>
      <thead><tr><th>Status</th><th className="num">Test cases</th><th className="num">Share</th></tr></thead>
      <tbody>
        {coverage.map((s) => (
          <tr key={s.status}><td>{STATUS_LABELS[s.status]}</td><td className="num">{s.count}</td><td className="num">{pct(s.count)}%</td></tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartCard
      id="chart-coverage"
      title="Test cases by status"
      subtitle="Every test case in the library, by its current status."
      table={total > 0 && table}
    >
      {total === 0 ? (
        <ChartEmpty action={{ href: '/test-cases', text: 'Add your first test case' }}>No test cases yet.</ChartEmpty>
      ) : (
        <div className="donut-layout">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${total} test cases by status: ${coverage.map((s) => `${s.count} ${s.status}`).join(', ')}.`} onMouseLeave={() => setHover(null)}>
            {slices.length === 1 ? (
              <circle className={`status-fill-${slices[0].status}`} cx={c} cy={c} r={(rOuter + rInner) / 2} strokeWidth={rOuter - rInner} style={{ fill: 'none', stroke: 'var(--fill)' }} onMouseEnter={() => setHover(slices[0].status)} />
            ) : (
              slices.map((s) => (
                <path
                  key={s.status}
                  className={`status-fill-${s.status}${hover && hover !== s.status ? ' is-dimmed' : ''}`}
                  d={arcPath(c, c, hover === s.status ? rOuter + 4 : rOuter, rInner, s.a0, s.a1)}
                  onMouseEnter={() => setHover(s.status)}
                />
              ))
            )}
            <text className="donut-total" x={c} y={c - 4} textAnchor="middle">{hovered ? hovered.count : total}</text>
            <text className="donut-caption" x={c} y={c + 16} textAnchor="middle">
              {hovered ? `${STATUS_LABELS[hovered.status].toLowerCase()} · ${pct(hovered.count)}%` : 'test cases'}
            </text>
          </svg>
          <ul className="donut-legend" aria-label="Legend">
            {coverage.map((s) => (
              <li
                key={s.status}
                className={`${s.count === 0 ? 'is-zero' : ''}${hover === s.status ? ' is-active' : ''}`}
                onMouseEnter={() => s.count > 0 && setHover(s.status)}
                onMouseLeave={() => setHover(null)}
              >
                <span className={`chart-swatch status-fill-${s.status}`} aria-hidden="true" />
                <span className="donut-legend-label">{STATUS_LABELS[s.status]}</span>
                <span className="donut-legend-count">{s.count}</span>
                <span className="donut-legend-pct">{pct(s.count)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartCard>
  );
}
