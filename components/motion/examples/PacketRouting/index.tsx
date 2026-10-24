'use client';

import LottieMotion, { type LottieMotionProps } from '../../LottieMotion';

// Loaders live at module scope: stable identities (no reloads on re-render) and separate chunks,
// so only the active theme's JSON is ever downloaded.
const light = () => import('./light.json');
const dark = () => import('./dark.json');

export type PacketRoutingProps = Omit<LottieMotionProps, 'light' | 'dark' | 'width' | 'height'>;

/**
 * Requests from many sources are routed into one core
 * Composition 720×440 · 6s. Size it with the parent (it fills the width, keeps its aspect ratio).
 */
export default function PacketRouting(props: PacketRoutingProps) {
  return (
    <LottieMotion
      light={light}
      dark={dark}
      width={720}
      height={440}
      label="Requests from many sources are routed into a single core"
      posterFrame={144}
      {...props}
    />
  );
}
