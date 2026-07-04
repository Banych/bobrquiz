import { ImageResponse } from 'next/og';
import { mascotShapes, MASCOT_VIEW_BOX } from './beaver-mascot-shapes';

export function createMascotIconResponse(size: number) {
  return new ImageResponse(
    <svg width={size} height={size} viewBox={MASCOT_VIEW_BOX}>
      {mascotShapes()}
    </svg>,
    { width: size, height: size }
  );
}
