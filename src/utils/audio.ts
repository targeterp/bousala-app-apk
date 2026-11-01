export const playBeep = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    
    const audioCtx = new AudioContext();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    // خصائص صوت ماسح السوبرماركت (Piezo Buzzer):
    // موجة مربعة (Square) بتردد عالي (2500Hz) ومدة قصيرة جداً
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(2500, audioCtx.currentTime); 
    
    // التحكم في مستوى الصوت (Envelope)
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    // ارتفاع سريع للصوت (Attack)
    gainNode.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + 0.01);
    // ثبات الصوت لجزء من الثانية (Sustain)
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime + 0.06);
    // انخفاض سريع للصوت (Release)
    gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.08);

    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.1);
  } catch (e) {
    console.error("Audio play failed", e);
  }
};
