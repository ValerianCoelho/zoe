'use client';

import LottieMotion, { type LottieMotionProps } from '../../LottieMotion';

// Loaders live at module scope: stable identities (no reloads on re-render) and separate chunks,
// so only the active theme's JSON is ever downloaded.
const light = () => import('./light.json');
const dark = () => import('./dark.json');

export type SingleSourceProps = Omit<LottieMotionProps, 'light' | 'dark' | 'width' | 'height'>;

/**
 * One source of truth, many uses
 * Composition 800×480 · 7s. Size it with the parent (it fills the width, keeps its aspect ratio).
 */
export default function SingleSource(props: SingleSourceProps) {
  return (
    <LottieMotion
      light={light}
      dark={dark}
      width={800}
      height={480}
      label="Data from five sources flows into one central hub, which then feeds three different tools"
      posterFrame={260}
      {...props}
    />
  );
}
