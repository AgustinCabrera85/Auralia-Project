import type { Scene } from '@babylonjs/core';

export type AuraliaWindState = {
  time: number;
  strength: number;
  effectiveStrength: number;
  gust: number;
  direction: [number, number];
  setStrength(value: number): void;
  setDirection(x: number, z: number): void;
};

/** One wind clock and gust envelope per scene, regardless of instance count. */
const WINDS = new WeakMap<Scene, AuraliaWindState>();
const BASE_STRENGTH = 0.65;

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

export function getAuraliaWind(scene: Scene): AuraliaWindState {
  const existing = WINDS.get(scene);
  if (existing) return existing;

  let elapsed = 0;
  let nextGustAt = 7;
  let gustStart = -1;
  let gustDuration = 0;
  let gustPeak = 1;
  let seed = 0x6d2b79f5;
  const random = (): number => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };

  const wind: AuraliaWindState = {
    time: 0,
    strength: BASE_STRENGTH,
    effectiveStrength: BASE_STRENGTH,
    gust: 0,
    direction: [1, 0.2],
    setStrength(value) {
      if (!Number.isFinite(value)) return;
      this.strength = clamp(value, 0, 2);
      this.effectiveStrength = clamp(this.strength * (1 + gustPeak * this.gust), 0, 2);
    },
    setDirection(x, z) {
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      const length = Math.hypot(x, z);
      this.direction = length < 0.001 ? [1, 0] : [x / length, z / length];
    },
  };
  const observer = scene.onBeforeRenderObservable.add(() => {
    const seconds = scene.getEngine().getDeltaTime() / 1000;
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    // Paused tabs resume gently instead of skipping an entire gust.
    const dt = Math.min(seconds, 0.25);
    elapsed += dt;
    wind.time = (wind.time + dt) % 1000;
    if (elapsed >= nextGustAt) {
      gustStart = elapsed;
      gustDuration = 3.5 + random() * 2;
      gustPeak = 0.9 + random() * 0.35;
      nextGustAt = elapsed + gustDuration + 8 + random() * 7;
    }
    const phase = gustDuration > 0 ? (elapsed - gustStart) / gustDuration : -1;
    wind.gust = phase >= 0 && phase <= 1 ? Math.sin(Math.PI * phase) ** 2 : 0;
    wind.effectiveStrength = clamp(wind.strength * (1 + gustPeak * wind.gust), 0, 2);
  });
  scene.onDisposeObservable.addOnce(() => {
    scene.onBeforeRenderObservable.remove(observer);
    WINDS.delete(scene);
  });
  WINDS.set(scene, wind);
  return wind;
}
