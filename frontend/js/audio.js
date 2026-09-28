/**
 * Audio Engine & Speech Synthesis for SMART REM
 * Uses Web Audio API for custom chime/alarm synthesis and Web Speech API for voice reminders.
 */

class AudioEngine {
  constructor() {
    this.audioCtx = null;
    this.alarmInterval = null;
    this.isPlayingAlarm = false;
    this.synth = window.speechSynthesis;
  }

  init() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContext();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  /**
   * Play melodic reminder chime
   */
  playChimeTone() {
    this.init();
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

        gain.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.5);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.5);
      }, idx * 120);
    });
  }

  /**
   * Continuous repeating reminder alarm
   */
  startReminderAlarm() {
    this.init();
    if (this.isPlayingAlarm) return;
    this.isPlayingAlarm = true;

    this.playChimeTone();
    this.alarmInterval = setInterval(() => {
      if (this.isPlayingAlarm) {
        this.playChimeTone();
      }
    }, 3000);
  }

  stopReminderAlarm() {
    this.isPlayingAlarm = false;
    if (this.alarmInterval) {
      clearInterval(this.alarmInterval);
      this.alarmInterval = null;
    }
  }

  /**
   * Play buzzer sound for hardware simulation
   */
  playBuzzerSound() {
    this.init();
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, this.audioCtx.currentTime); // A5

    gain.gain.setValueAtTime(0.25, this.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.start();
    osc.stop(this.audioCtx.currentTime + 0.3);
  }

  /**
   * Play Success confirmation sound
   */
  playSuccessSound() {
    this.init();
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, this.audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, this.audioCtx.currentTime + 0.25);

    gain.gain.setValueAtTime(0.4, this.audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    osc.start();
    osc.stop(this.audioCtx.currentTime + 0.4);
  }

  /**
   * Text-to-Speech Voice Assistant for Seniors
   */
  speakText(text) {
    if (!this.synth) return;
    this.synth.cancel(); // Stop any ongoing speech

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9; // Slower, clearer cadence for elderly
    utterance.pitch = 1.05;
    utterance.volume = 1.0;

    // Try selecting an English voice
    const voices = this.synth.getVoices();
    const englishVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha')));
    if (englishVoice) {
      utterance.voice = englishVoice;
    }

    this.synth.speak(utterance);
  }
}

window.soundEngine = new AudioEngine();
