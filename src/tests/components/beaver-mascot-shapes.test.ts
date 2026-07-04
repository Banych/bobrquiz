import { describe, it, expect } from 'vitest';
import type { MascotColors } from '@components/brand/beaver-mascot-shapes';

describe('beaver-mascot-shapes', () => {
  it('should export mascotShapes, MASCOT_COLORS_CSS_VAR, and MASCOT_COLORS_STATIC', async () => {
    const mod = await import('@components/brand/beaver-mascot-shapes');
    expect(typeof mod.mascotShapes).toBe('function');
    expect(mod.MASCOT_COLORS_CSS_VAR).toBeDefined();
    expect(mod.MASCOT_COLORS_STATIC).toBeDefined();
  });

  it('should define all six mascot color keys on the CSS-var palette', async () => {
    const { MASCOT_COLORS_CSS_VAR } = await import(
      '@components/brand/beaver-mascot-shapes'
    );
    const keys: Array<keyof MascotColors> = [
      'fur',
      'furDark',
      'belly',
      'teeth',
      'eye',
      'nose',
    ];
    keys.forEach((key) => {
      expect(MASCOT_COLORS_CSS_VAR[key]).toMatch(/^var\(--mascot-/);
    });
  });

  it('should define all six mascot color keys on the static hex palette', async () => {
    const { MASCOT_COLORS_STATIC } = await import(
      '@components/brand/beaver-mascot-shapes'
    );
    const keys: Array<keyof MascotColors> = [
      'fur',
      'furDark',
      'belly',
      'teeth',
      'eye',
      'nose',
    ];
    keys.forEach((key) => {
      expect(MASCOT_COLORS_STATIC[key]).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });

  it('should render a fragment containing the eye and teeth shapes', async () => {
    const { mascotShapes, MASCOT_COLORS_STATIC } = await import(
      '@components/brand/beaver-mascot-shapes'
    );
    const fragment = mascotShapes(MASCOT_COLORS_STATIC);
    const children = fragment.props.children as Array<{
      type: string;
      props: Record<string, unknown>;
    }>;
    const fills = children.map((child) => child.props.fill);
    expect(fills).toContain(MASCOT_COLORS_STATIC.eye);
    expect(fills).toContain(MASCOT_COLORS_STATIC.teeth);
  });
});
