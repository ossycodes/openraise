import { validateEnv } from './env.js';

describe('validateEnv', () => {
  it('applies defaults', () => {
    expect(validateEnv({})).toEqual({
      NODE_ENV: 'development',
      PORT: 4000,
      WEB_URL: 'http://localhost:3000',
    });
  });

  it('coerces PORT from a string', () => {
    expect(validateEnv({ PORT: '8080' }).PORT).toBe(8080);
  });

  it('names the bad variable in the error', () => {
    expect(() => validateEnv({ WEB_URL: 'not a url' })).toThrow(/WEB_URL/);
  });
});
