// O teste e o aviso automático usam a mesma saída de áudio desta aba.
let context: AudioContext | undefined;

export function enableWorkAudio(): AudioContext {
  if (!context || context.state === "closed") context = new AudioContext();
  if (context.state !== "running") void context.resume().catch(() => {});
  return context;
}

export function closeWorkAudio() {
  if (context && context.state !== "closed") void context.close().catch(() => {});
  context = undefined;
}

export function playWorkTone(output: AudioContext) {
  if (output.state !== "running") return false;
  const oscillator = output.createOscillator();
  const gain = output.createGain();
  const start = output.currentTime;
  oscillator.frequency.value = 740;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(0.21, start + 0.025);
  gain.gain.setValueAtTime(0.21, start + 0.17);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.62);
  oscillator.connect(gain).connect(output.destination);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  oscillator.start(start);
  oscillator.stop(start + 0.63);
  return true;
}

export async function testWorkTone() {
  const output = enableWorkAudio();
  if (output.state !== "running") {
    // Alguns navegadores deixam resume() pendente se o áudio estiver bloqueado.
    await new Promise<void>(resolve => {
      const finish = () => {
        window.clearTimeout(timeout);
        output.removeEventListener("statechange", onState);
        resolve();
      };
      const onState = () => { if (output.state === "running") finish(); };
      const timeout = window.setTimeout(finish, 2000);
      output.addEventListener("statechange", onState);
      onState();
    });
  }
  return playWorkTone(output);
}
