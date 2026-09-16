import { TokenService } from './token.service.js';

describe('TokenService', () => {
  const service = new TokenService();

  it('genera un token opaco cuyo hash es determinístico y verificable', () => {
    const { plain, hash } = service.generateOpaqueToken();

    expect(plain).toHaveLength(64);
    expect(hash).toBe(service.hashToken(plain));
  });

  it('genera valores distintos en cada llamada', () => {
    const a = service.generateOpaqueToken();
    const b = service.generateOpaqueToken();

    expect(a.plain).not.toBe(b.plain);
    expect(a.hash).not.toBe(b.hash);
  });
});
