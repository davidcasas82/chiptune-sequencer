export const PEN_MENU_SLOP = 8;
export const PEN_MENU_PRESSURE = 0.12;

export function penMenuHold(input: {
  pointerType: string;
  startPressure: number;
  pressure: number;
  movedPx: number;
}): boolean {
  if (input.movedPx > PEN_MENU_SLOP) return false;
  if (input.pointerType !== 'pen') return true;
  if (Math.abs(input.pressure - input.startPressure) >= PEN_MENU_PRESSURE) return false;
  if (Math.max(input.pressure, input.startPressure) < PEN_MENU_PRESSURE) return false;
  return true;
}
