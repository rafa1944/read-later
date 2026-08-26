import { describe, expect, it } from 'vitest';
import { createSessionToken, verifySessionToken } from '@/lib/session';

describe('sesión', () => {
  it('acepta un token propio', async () => {
    expect(await verifySessionToken(await createSessionToken())).toBe(true);
  });

  it('rechaza un token ausente, vacío o manipulado', async () => {
    expect(await verifySessionToken(undefined)).toBe(false);
    expect(await verifySessionToken('')).toBe(false);
    expect(await verifySessionToken(`${await createSessionToken()}x`)).toBe(false);
  });
});
