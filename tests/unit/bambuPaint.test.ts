import { describe, it, expect } from 'vitest';
import { encodePaintColor, paintColorForMaterial } from '../../src/export/bambuPaint';

describe('encodePaintColor', () => {
  it('returns no attribute for the default extruder (≤ 1)', () => {
    expect(encodePaintColor(0)).toBe('');
    expect(encodePaintColor(1)).toBe('');
    expect(encodePaintColor(-3)).toBe('');
  });

  it('encodes the first two painted colors as single nibbles', () => {
    // extruder 2 → state 1 → split 00, state-bits 01 → nibble 0x4
    expect(encodePaintColor(2)).toBe('4');
    // extruder 3 → state 2 → split 00, state-bits 10 → nibble 0x8
    expect(encodePaintColor(3)).toBe('8');
  });

  it('escapes extruders ≥ 4 with the 0xC nibble + (state-3)', () => {
    // extruder 4 → state 3 → escape "C" + (3-3)=0
    expect(encodePaintColor(4)).toBe('C0');
    expect(encodePaintColor(5)).toBe('C1');
    expect(encodePaintColor(6)).toBe('C2');
    expect(encodePaintColor(10)).toBe('C6');
    // extruder 16 (16th filament, Bambu's max) → state 15 → (15-3)=12 → 0xC
    expect(encodePaintColor(16)).toBe('CC');
  });

  it('throws past Bambu\'s 16-filament limit instead of silently wrapping', () => {
    expect(() => encodePaintColor(17)).toThrow(/at most 16 filaments/);
    expect(() => encodePaintColor(19)).toThrow(/at most 16 filaments/);
  });

  it('ignores non-integer input', () => {
    expect(encodePaintColor(2.5)).toBe('');
    expect(encodePaintColor(NaN)).toBe('');
  });
});

describe('paintColorForMaterial', () => {
  it('leaves the base/default slot (0) unpainted', () => {
    expect(paintColorForMaterial(0)).toBe('');
    expect(paintColorForMaterial(-1)).toBe('');
  });

  it('maps painted slot m to extruder (m+1)', () => {
    // slot 1 → extruder 2 → "4"
    expect(paintColorForMaterial(1)).toBe('4');
    // slot 2 → extruder 3 → "8"
    expect(paintColorForMaterial(2)).toBe('8');
    // slot 3 → extruder 4 → "C0"
    expect(paintColorForMaterial(3)).toBe('C0');
  });
});
