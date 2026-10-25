'use client';

import LottieMotion, { type LottieMotionProps } from '../../LottieMotion';

// Loaders live at module scope: stable identities (no reloads on re-render) and separate chunks,
// so only the active theme's JSON is ever downloaded.
const light = () => import('./light.json');
const dark = () => import('./dark.json');

export type TripInviteProps = Omit<LottieMotionProps, 'light' | 'dark' | 'width' | 'height'>;

/**
 * Share one link and everyone is in
 * Composition 640×440 · 7s (intro + loop). Size it with the parent (it fills the width, keeps its aspect ratio).
 */
export default function TripInvite(props: TripInviteProps) {
  return (
    <LottieMotion
      light={light}
      dark={dark}
      width={640}
      height={440}
      label="An invite link is shared and four friends join the trip, filling its avatar stack"
      posterFrame={250}
      {...props}
    />
  );
}
