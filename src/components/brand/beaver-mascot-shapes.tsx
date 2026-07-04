export interface MascotColors {
  fur: string;
  furDark: string;
  belly: string;
  teeth: string;
  eye: string;
  nose: string;
}

/**
 * Shared beaver geometry. Callers wrap this in their own
 * `<svg viewBox="0 0 200 200">` — kept viewBox-agnostic so it can be
 * embedded at any size, in the live app (CSS-var colors) or in
 * next/og ImageResponse contexts (static hex colors).
 */
export function mascotShapes(colors: MascotColors) {
  return (
    <g>
      <ellipse cx="100" cy="172" rx="50" ry="26" fill={colors.furDark} />
      <path
        d="M70 165 L75 178 M90 168 L93 182 M110 168 L107 182 M130 165 L125 178"
        stroke={colors.belly}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        opacity="0.5"
      />
      <ellipse cx="100" cy="118" rx="55" ry="50" fill={colors.fur} />
      <ellipse cx="100" cy="132" rx="30" ry="34" fill={colors.belly} />
      <circle cx="100" cy="62" r="42" fill={colors.fur} />
      <circle cx="66" cy="30" r="12" fill={colors.furDark} />
      <circle cx="134" cy="30" r="12" fill={colors.furDark} />
      <circle cx="66" cy="30" r="6" fill={colors.belly} />
      <circle cx="134" cy="30" r="6" fill={colors.belly} />
      <ellipse cx="100" cy="78" rx="26" ry="20" fill={colors.belly} />
      <circle cx="84" cy="58" r="7" fill={colors.eye} />
      <circle cx="116" cy="58" r="7" fill={colors.eye} />
      <ellipse cx="100" cy="76" rx="7" ry="5" fill={colors.nose} />
      <rect
        x="90"
        y="86"
        width="10"
        height="18"
        rx="3"
        fill={colors.teeth}
        stroke={colors.furDark}
        strokeWidth="1.5"
      />
      <rect
        x="100"
        y="86"
        width="10"
        height="18"
        rx="3"
        fill={colors.teeth}
        stroke={colors.furDark}
        strokeWidth="1.5"
      />
    </g>
  );
}

export const MASCOT_COLORS_CSS_VAR: MascotColors = {
  fur: 'var(--mascot-fur)',
  furDark: 'var(--mascot-fur-dark)',
  belly: 'var(--mascot-belly)',
  teeth: 'var(--mascot-teeth)',
  eye: 'var(--mascot-eye)',
  nose: 'var(--mascot-nose)',
};

export const MASCOT_COLORS_STATIC: MascotColors = {
  fur: '#8a5a3b',
  furDark: '#5c3c28',
  belly: '#e8d2b0',
  teeth: '#fdf6e8',
  eye: '#241a13',
  nose: '#3b2415',
};
