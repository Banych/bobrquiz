import { createMascotIconResponse } from '@components/brand/mascot-image-response';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

// ImageResponse must be generated on request, not prerendered
export const dynamic = 'force-dynamic';

export default function AppleIcon() {
  return createMascotIconResponse(180);
}
