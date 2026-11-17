export type SkinName = 'crt' | 'neon';

export const ink = {
  name: 'crt' as SkinName,
  bg: '#070a08',
  alt: '#0c120e',
  amber: '#ffb000',
  green: '#39ff6a',
  live: '#7dff9a',
  ghost: 'rgba(57, 255, 106, 0.28)',
  dim: '#1b5c32',
  line: '#24301a',
  ink: '#071007',
  grid: '#182116',
  outside: '#040604',
  black: '#10140f',
  amberDim: '#6a5420',
  amberMid: '#8a6a20',
  amberMute: '#4a3c18',
  fill: '#12361f',
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
};

export function setSkin(next: SkinName): void {
  const picked = next === 'neon' ? NEON : CRT;
  Object.assign(ink, picked);
  document.documentElement.dataset.skin = picked.name;
}
