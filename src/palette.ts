export type SkinName = 'crt' | 'neon';

export const ink = {
  name: 'crt' as SkinName,
  bg: '#cddd9a',
  alt: '#d4e4a4',
  amber: '#1c2414',
  green: '#1a4030',
  live: '#245c40',
  ghost: 'rgba(26, 64, 48, 0.28)',
  dim: '#7f946c',
  line: '#8ea56a',
  ink: '#f4ffe8',
  grid: '#b4c688',
  outside: '#c9ccb0',
  black: '#c3d492',
  amberDim: '#3e4c32',
  amberMid: '#2a3820',
  amberMute: '#6a7860',
  fill: '#b7cc7c',
  playhead: '#d0122d',
};

const CRT = { ...ink, name: 'crt' as SkinName };
const NEON: typeof ink = {
  name: 'neon',
  bg: '#07060f',
  alt: '#120818',
  amber: '#7af0ff',
  green: '#ff4ad8',
  live: '#ff9ae8',
  ghost: 'rgba(255, 74, 216, 0.28)',
  dim: '#6a2454',
  line: '#2a1840',
  ink: '#140810',
  grid: '#1c1230',
  outside: '#05030a',
  black: '#140c1c',
  amberDim: '#3d6d78',
  amberMid: '#8fd8e4',
  amberMute: '#2a4450',
  fill: '#3a1238',
  playhead: '#7af0ff',
};

export function setSkin(next: SkinName): void {
  const picked = next === 'neon' ? NEON : CRT;
  Object.assign(ink, picked);
  document.documentElement.dataset.skin = picked.name;
}
