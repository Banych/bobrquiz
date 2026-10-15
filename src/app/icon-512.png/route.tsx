import { createMascotIconResponse } from '@components/brand/mascot-image-response';

export async function GET() {
  return createMascotIconResponse(512);
}
