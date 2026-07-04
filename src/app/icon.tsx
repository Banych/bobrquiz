import { createMascotIconResponse } from '@components/brand/mascot-image-response';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return createMascotIconResponse(32);
}
