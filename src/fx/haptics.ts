import { Haptics, ImpactStyle } from '@capacitor/haptics';

let enabled = true;
export function configureHaptics(on: boolean) { enabled = on; }

export function buzz(kind: 'light' | 'medium' | 'heavy') {
  if (!enabled) return;
  const style = kind === 'light' ? ImpactStyle.Light : kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Heavy;
  Haptics.impact({ style }).catch(() => {});
}
