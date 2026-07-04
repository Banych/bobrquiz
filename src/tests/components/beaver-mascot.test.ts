import { describe, it, expect } from 'vitest';
import type { BeaverMascotProps } from '@components/brand/beaver-mascot';

describe('BeaverMascot', () => {
  it('should export BeaverMascot component', async () => {
    const mod = await import('@components/brand/beaver-mascot');
    expect(typeof mod.BeaverMascot).toBe('function');
  });

  it('should default size to 48 when not provided', async () => {
    const { BeaverMascot } = await import('@components/brand/beaver-mascot');
    const element = BeaverMascot({});
    expect(element.props.width).toBe(48);
    expect(element.props.height).toBe(48);
  });

  it('should apply a provided size to width and height', async () => {
    const { BeaverMascot } = await import('@components/brand/beaver-mascot');
    const props: BeaverMascotProps = { size: 96 };
    const element = BeaverMascot(props);
    expect(element.props.width).toBe(96);
    expect(element.props.height).toBe(96);
  });

  it('should forward className to the svg element', async () => {
    const { BeaverMascot } = await import('@components/brand/beaver-mascot');
    const element = BeaverMascot({ className: 'h-12 w-12' });
    expect(element.props.className).toBe('h-12 w-12');
  });
});
