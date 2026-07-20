import { ref } from 'vue'
import {
  isAudioMuted,
  toggleAudioMuted,
  playArchiveHover,
  playArchiveSlide,
  playAlbumOpen,
  playBookSettle,
  playArchiveConfirm,
} from '../runtime/audioSynth'

export function useAudioSynth() {
  const isMuted = ref(isAudioMuted());

  const toggleMute = () => {
    isMuted.value = toggleAudioMuted();
  };

  return {
    isMuted,
    toggleMute,
    playArchiveHover,
    playArchiveSlide,
    playAlbumOpen,
    playBookSettle,
    playArchiveConfirm,
  };
}
