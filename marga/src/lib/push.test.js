import { describe, expect, it } from 'vitest';
import { llaveABytes, VAPID_PUBLIC_KEY } from './push.js';

describe('llaveABytes', () => {
  it('la llave pública VAPID es un punto P-256 sin comprimir (65 bytes, empieza en 0x04)', () => {
    const bytes = llaveABytes(VAPID_PUBLIC_KEY);
    expect(bytes.length).toBe(65);
    expect(bytes[0]).toBe(4);
  });
});
