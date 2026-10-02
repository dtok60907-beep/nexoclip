// A short two-tone chime for incoming chat messages, synthesized with Web
// Audio so no sound file has to ship. Browsers only allow audio after the
// user has interacted with the page; until then this is silently skipped.

let context: AudioContext | null = null

export function playChatChime(): void {
  try {
    const AudioContextClass = window.AudioContext
      || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    context ??= new AudioContextClass()
    if (context.state === 'suspended') void context.resume()
    const now = context.currentTime
    for (const [index, frequency] of [880, 1320].entries()) {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency
      const start = now + index * 0.09
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.08, start + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(start)
      oscillator.stop(start + 0.2)
    }
  } catch {
    // Audio is a nicety; never let it break chat.
  }
}
