import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useEffect } from 'react';

let player: AudioPlayer | null = null;

/** One shared looping player for the whole app (a ring must never double up). */
function ringPlayer(): AudioPlayer {
  if (!player) {
    void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'duckOthers' });
    player = createAudioPlayer(require('@/assets/sounds/order_ring.wav'));
    player.loop = true;
  }
  return player;
}

/** Loops the order ring while `ringing` is true — kitchens are loud, a single chime gets missed. */
export function useRinger(ringing: boolean) {
  useEffect(() => {
    const p = ringPlayer();
    if (ringing) p.play();
    else {
      p.pause();
      void p.seekTo(0);
    }
    return () => p.pause();
  }, [ringing]);
}
