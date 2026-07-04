import { describe, it, expect } from 'vitest';

describe('mascot-image-response', () => {
  it('should export createMascotIconResponse as a function', async () => {
    const mod = await import('@components/brand/mascot-image-response');
    expect(typeof mod.createMascotIconResponse).toBe('function');
  });

  it('should return a Response with an image/png content-type', async () => {
    const { createMascotIconResponse } = await import(
      '@components/brand/mascot-image-response'
    );
    const response = createMascotIconResponse(64);
    expect(response.headers.get('content-type')).toContain('image/png');
  });
});
