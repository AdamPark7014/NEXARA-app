import { encryptSecret, decryptSecret } from './integra-secrets';

describe('integra-secrets', () => {
  const prev = process.env.INTEGRA_SECRETS_KEY;

  beforeAll(() => {
    process.env.INTEGRA_SECRETS_KEY = 'test-integra-secrets-key';
  });

  afterAll(() => {
    if (prev === undefined) delete process.env.INTEGRA_SECRETS_KEY;
    else process.env.INTEGRA_SECRETS_KEY = prev;
  });

  it('round-trip AES-GCM', () => {
    const plain = 'hik-app-secret-xyz';
    const enc = encryptSecret(plain);
    expect(enc).not.toBe(plain);
    expect(decryptSecret(enc)).toBe(plain);
  });

  it('ciphertexts distintos (IV aleatorio)', () => {
    const a = encryptSecret('same');
    const b = encryptSecret('same');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('same');
    expect(decryptSecret(b)).toBe('same');
  });
});
