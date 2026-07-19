import { ref } from 'vue';
import { isAudioMuted, toggleAudioMuted, playCrystalTick, playPaperSlide, playDeepWhoosh } from '../runtime/audioSynth';

export function useAudioSynth() {
  const isMuted = ref(isAudioMuted());

  const toggleMute = () => {
    isMuted.value = toggleAudioMuted();
  };

  return {
    isMuted,
    toggleMute,
    playCrystalTick,
    playPaperSlide,
    playDeepWhoosh
  };
}
