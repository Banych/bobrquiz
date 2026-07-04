import { ImageResponse } from 'next/og';
import { mascotShapes, MASCOT_COLORS_STATIC } from './beaver-mascot-shapes';

export function createMascotIconResponse(size: number) {
  return new ImageResponse(
    <svg width={size} height={size} viewBox="0 0 200 200">
      {mascotShapes(MASCOT_COLORS_STATIC)}
    </svg>,
    { width: size, height: size }
  );
}
