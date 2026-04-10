import { useSavingsStore } from '@/stores/useSavingsStore';

const cx = 100;
const cy = 100;
const r = 80;
const MAX_RUNWAY = 12;
const STROKE_WIDTH = 14;
// Semicircle: left (cx-r, cy) → arc up through top → right (cx+r, cy)
const arcPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
const pathLength = Math.PI * r; // ≈ 251.33 — total arc length for dasharray

function getArcColor(runway: number): string {
  if (runway < 1) return 'var(--color-runway-critical)';
  if (runway < 3) return 'var(--color-runway-caution)';
  return 'var(--color-runway-healthy)';
}

export default function RunwayGauge() {
  const { reconciliations, runway, runwayDelta } = useSavingsStore();

  const hasData = reconciliations.length > 0;
  const runwayValue = hasData ? runway() : 0;
  const fillPercent = hasData ? Math.min(runwayValue / MAX_RUNWAY, 1) : 0;
  const dashOffset = pathLength * (1 - fillPercent);

  // prefers-reduced-motion: check once, suppress CSS transition when active
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const delta = reconciliations.length >= 2 ? runwayDelta() : null;
  const deltaSign = delta !== null ? (delta > 0 ? '↑ +' : delta < 0 ? '↓ ' : '→ ') : '';
  const deltaColor =
    delta === null ? ''
    : delta > 0 ? 'var(--color-runway-healthy)'
    : delta < 0 ? 'var(--color-runway-critical)'
    : 'var(--color-text-secondary)';

  const ariaLabel = !hasData
    ? 'Runway gauge: no data'
    : `${runwayValue} months runway${
        delta !== null && delta > 0 ? ', improving'
        : delta !== null && delta < 0 ? ', declining'
        : ''
      }`;

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox="0 0 200 160"
        width="200"
        height="160"
        role="img"
        aria-label={ariaLabel}
        data-testid="runway-gauge"
      >
        {/* Background track — always full semicircle, gauge-track color */}
        <path
          data-testid="runway-track"
          d={arcPath}
          fill="none"
          stroke="var(--color-gauge-track)"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
        />

        {/* Fill arc — only when data exists and runway > 0 */}
        {hasData && fillPercent > 0 && (
          <path
            data-testid="runway-fill"
            d={arcPath}
            fill="none"
            stroke={getArcColor(runwayValue)}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={pathLength}
            strokeDashoffset={dashOffset}
            style={{
              transition: prefersReducedMotion
                ? 'none'
                : 'stroke-dashoffset 0.6s ease-out',
            }}
          />
        )}

        {/* Center number — Display weight (28px/700) */}
        <text
          data-testid="runway-value"
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="28"
          fontWeight="700"
          fill="var(--color-text-primary)"
        >
          {hasData ? runwayValue : '—'}
        </text>

        {/* "months runway" label */}
        <text
          x={cx}
          y={cy + 20}
          textAnchor="middle"
          fontSize="12"
          fill="var(--color-text-secondary)"
        >
          months runway
        </text>

        {/* Delta indicator — only when >= 2 reconciliations */}
        {delta !== null && (
          <text
            data-testid="runway-delta"
            x={cx}
            y={cy + 38}
            textAnchor="middle"
            fontSize="11"
            fill={deltaColor}
          >
            {deltaSign}{Math.abs(delta)} this month
          </text>
        )}
      </svg>

      {/* Empty-state prompt — outside SVG */}
      {!hasData && (
        <p
          className="text-xs italic text-center"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Enter your savings balance to start tracking runway
        </p>
      )}
    </div>
  );
}
