import { describe, expect, it } from 'vitest';
import { isPrivateAddress } from '@/lib/net-guard';

describe('isPrivateAddress', () => {
  it('detecta las redes privadas y especiales de IPv4', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254',
      '0.0.0.0',
      '100.64.0.1',
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it('acepta direcciones públicas de IPv4', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '93.184.216.34']) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it('detecta loopback, enlace-local y únicas locales de IPv6', () => {
    for (const ip of ['::1', 'fe80::1', 'fc00::1', 'fd12:3456::1', '::ffff:127.0.0.1']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it('acepta una IPv6 pública', () => {
    expect(isPrivateAddress('2606:4700:4700::1111')).toBe(false);
  });
});
