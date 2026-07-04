import { ImageResponse } from 'next/og';
import {
  mascotShapes,
  MASCOT_COLORS_STATIC,
} from '@components/brand/beaver-mascot-shapes';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 48,
        background: '#1a120b',
      }}
    >
      <svg width="220" height="220" viewBox="0 0 200 200">
        {mascotShapes(MASCOT_COLORS_STATIC)}
      </svg>
      <div
        style={{
          display: 'flex',
          fontSize: 96,
          fontWeight: 700,
          color: '#f6e6c8',
        }}
      >
        Bobr Quiz
      </div>
    </div>,
    { ...size }
  );
}
