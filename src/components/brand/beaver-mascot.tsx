import { mascotShapes, MASCOT_VIEW_BOX } from './beaver-mascot-shapes';

export interface BeaverMascotProps {
  className?: string;
  size?: number;
}

export function BeaverMascot({ className, size = 48 }: BeaverMascotProps) {
  return (
    <svg
      viewBox={MASCOT_VIEW_BOX}
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Bobr Quiz mascot"
    >
      {mascotShapes()}
    </svg>
  );
}
