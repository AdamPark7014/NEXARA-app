import { CEO_CHRISTIAN_USER_ID, esCeoChristian } from './ceo-user.js';

describe('esCeoChristian', () => {
  it('solo el usuario 1', () => {
    expect(CEO_CHRISTIAN_USER_ID).toBe(1);
    expect(esCeoChristian(1)).toBe(true);
    expect(esCeoChristian(2)).toBe(false);
    expect(esCeoChristian(0)).toBe(false);
    expect(esCeoChristian(null)).toBe(false);
    expect(esCeoChristian(undefined)).toBe(false);
  });
});
