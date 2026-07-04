import { describe, it, expect } from 'vitest';

describe('beaver-mascot-shapes', () => {
  it('should export mascotShapes and MASCOT_VIEW_BOX', async () => {
    const mod = await import('@components/brand/beaver-mascot-shapes');
    expect(typeof mod.mascotShapes).toBe('function');
    expect(typeof mod.MASCOT_VIEW_BOX).toBe('string');
  });

  it('should define a four-value viewBox string', async () => {
    const { MASCOT_VIEW_BOX } =
      await import('@components/brand/beaver-mascot-shapes');
    expect(MASCOT_VIEW_BOX.trim().split(/\s+/)).toHaveLength(4);
  });

  it('should render multiple color groups, each containing at least one path', async () => {
    const { mascotShapes } =
      await import('@components/brand/beaver-mascot-shapes');
    const fragment = mascotShapes();
    const groups = fragment.props.children as Array<{
      type: string;
      props: { fill: string; children: unknown };
    }>;
    expect(groups.length).toBeGreaterThan(1);
    groups.forEach((group) => {
      expect(group.type).toBe('g');
      expect(group.props.fill).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });
});
