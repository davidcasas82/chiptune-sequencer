export type Audible = { lo: number; hi: number; center: number };

const MELODY: Audible = { lo: 48, hi: 84, center: 69 };
const HARMONY: Audible = { lo: 48, hi: 79, center: 60 };
const BASS: Audible = { lo: 28, hi: 60, center: 43 };
const EXTRA_BASS: Audible = { lo: 24, hi: 52, center: 33 };

export const PITCH_MARGIN = 5;

export function audibleBand(channel: number): Audible | null {
  if (channel === 0) return MELODY;
  if (channel === 1) return HARMONY;
  if (channel === 2) return BASS;
  if (channel === 4) return EXTRA_BASS;
  return null;
}

export function pitchSpan(channel: number): { lo: number; hi: number } | null {
  const band = audibleBand(channel);
  if (!band) return null;
  return {
    lo: Math.max(0, band.lo - PITCH_MARGIN),
    hi: Math.min(127, band.hi + PITCH_MARGIN),
  };
}

export function inAudible(channel: number, note: number): boolean {
  const band = audibleBand(channel);
  if (!band) return true;
  return note >= band.lo && note <= band.hi;
}

export function clampAudible(channel: number, note: number): number {
  const band = audibleBand(channel);
  if (!band) return note;
  if (note < band.lo) return band.lo;
  if (note > band.hi) return band.hi;
  return note;
}

export type GridPointer = {
  pointerType: string;
  pointers: number;
  scrollbar: boolean;
  startRow: number;
  startPitch: number;
  pointerRow: number;
  scrollTop: number;
  proposedScroll: number;
};

export function strokeOnGrid(input: GridPointer): { scrollTop: number; pitch: number; row: number } {
  if (input.scrollbar || input.pointers >= 2) {
    return { scrollTop: input.proposedScroll, pitch: input.startPitch, row: input.startRow };
  }
  if (input.pointerType === 'pen' || input.pointerType === 'touch') {
    return { scrollTop: input.scrollTop, pitch: input.startPitch, row: input.startRow };
  }
  return { scrollTop: input.scrollTop, pitch: input.startPitch, row: input.pointerRow };
}
