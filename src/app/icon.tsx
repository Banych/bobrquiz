import { createMascotIconResponse } from '@components/brand/mascot-image-response';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

// ImageResponse must be generated on request, not prerendered
export const dynamic = 'force-dynamic';

export default function Icon() {
  return createMascotIconResponse(32);
}
