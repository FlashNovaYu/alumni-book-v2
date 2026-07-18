import { ref, watch } from 'vue';

// 全局单例状态以确保所有组件共享静音状态与 AudioContext
const isMuted = ref(false);
let audioCtx: AudioContext | null = null;

// 仅在浏览器客户端初始化状态
if (typeof window !== 'undefined') {
  const savedMuteState = localStorage.getItem('site_audio_muted');
  if (savedMuteState) {
    isMuted.value = savedMuteState === 'true';
  }
  
  watch(isMuted, (newVal) => {
    localStorage.setItem('site_audio_muted', String(newVal));
  });
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  
  return audioCtx;
}

// 恢复 suspended 状态（绕过浏览器的 autoplay 限制）
function resumeContext() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume();
  }
}

export function useAudioSynth() {
  // 极简合成：清脆“滴”或“咔”声
  const playCrystalTick = () => {
    if (isMuted.value) return;
    
    const ctx = getAudioContext();
    if (!ctx) return;
    resumeContext();
    
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc.type = 'sine';
    // 高频衰减
    osc.frequency.setValueAtTime(1200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.05);
    
    // 极短促的包络衰减
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
    
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  };

  // 极简合成：纸张翻动的“沙沙”声
  const playPaperSlide = () => {
    if (isMuted.value) return;
    
    const ctx = getAudioContext();
    if (!ctx) return;
    resumeContext();
    
    // 0.1秒的白噪音缓冲
    const bufferSize = ctx.sampleRate * 0.1; 
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = buffer;
    
    // 带通滤波过滤极高/极低频
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 800;
    filter.Q.value = 1.5;
    
    // 短促的增益衰减
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
    
    noiseSource.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    noiseSource.start();
    noiseSource.stop(ctx.currentTime + 0.1);
  };

  // 极简合成：用于页面级别的转场反馈
  const playDeepWhoosh = () => {
    if (isMuted.value) return;
    
    const ctx = getAudioContext();
    if (!ctx) return;
    resumeContext();
    
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc.type = 'sine';
    // 低频扫描
    osc.frequency.setValueAtTime(100, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.4);
    
    // 较大的释放时间
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.1);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  };

  const toggleMute = () => {
    isMuted.value = !isMuted.value;
    if (!isMuted.value) {
      // 开启声音时反馈一个极短的“滴”声
      playCrystalTick();
    }
  };

  return {
    isMuted,
    toggleMute,
    playCrystalTick,
    playPaperSlide,
    playDeepWhoosh
  };
}
