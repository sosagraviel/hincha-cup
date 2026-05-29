import { formatDate } from './format-date.js';

describe('formatDate', () => {
  it('formats an ISO string in en-US by default', () => {
    expect(formatDate('2026-05-11T00:00:00Z')).toMatch(/May/);
  });

  it('accepts a Date object', () => {
    expect(formatDate(new Date('2026-01-15T00:00:00Z'))).toMatch(/Jan/);
  });
});
