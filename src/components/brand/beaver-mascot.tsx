import { mascotShapes, MASCOT_COLORS_CSS_VAR } from './beaver-mascot-shapes';

export interface BeaverMascotProps {
  className?: string;
  size?: number;
}

export function BeaverMascot({ className, size = 48 }: BeaverMascotProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Bobr Quiz mascot"
    >
      {mascotShapes(MASCOT_COLORS_CSS_VAR)}
    </svg>
  );
}
