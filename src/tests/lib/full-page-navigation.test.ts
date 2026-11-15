import { afterEach, describe, expect, it, vi } from 'vitest';
import { navigateWithFullLoad } from '@/lib/full-page-navigation';

describe('navigateWithFullLoad', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads the path as a new document', () => {
    const assign = vi.fn();
    vi.stubGlobal('window', { location: { assign } });

    navigateWithFullLoad('/host?tab=quizzes');

    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith('/host?tab=quizzes');
  });
});
