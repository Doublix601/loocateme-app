import { isAtLeast18 } from '../age';

describe('isAtLeast18', () => {
  const fixedNow = new Date('2026-07-22T12:00:00Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(fixedNow);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns true for someone who turned 18 today', () => {
    expect(isAtLeast18('2008-07-22')).toBe(true);
  });

  it('returns false for someone who turns 18 tomorrow', () => {
    expect(isAtLeast18('2008-07-23')).toBe(false);
  });

  it('returns true for someone older than 18', () => {
    expect(isAtLeast18('1990-01-01')).toBe(true);
  });

  it('returns false for someone under 18', () => {
    expect(isAtLeast18('2015-01-01')).toBe(false);
  });

  it('returns false for an invalid date', () => {
    expect(isAtLeast18('not-a-date')).toBe(false);
    expect(isAtLeast18(undefined)).toBe(false);
  });

  it('accepts a Date instance directly', () => {
    expect(isAtLeast18(new Date('1990-01-01'))).toBe(true);
  });
});
