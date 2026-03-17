// Unit system declaration — metadata only, no coordinate transformation

export type UnitSystem = 'mm' | 'cm' | 'in' | 'unitless';

let currentUnit: UnitSystem = 'unitless';

export function setUnits(unit: UnitSystem): void {
  currentUnit = unit;
}

export function getUnits(): UnitSystem {
  return currentUnit;
}

export function formatDimension(value: number): string {
  if (currentUnit === 'unitless') return value.toFixed(2);
  return `${value.toFixed(2)} ${currentUnit}`;
}

export function get3MFUnitString(): string {
  switch (currentUnit) {
    case 'mm': return 'millimeter';
    case 'cm': return 'centimeter';
    case 'in': return 'inch';
    default: return 'millimeter'; // 3MF requires a unit
  }
}
