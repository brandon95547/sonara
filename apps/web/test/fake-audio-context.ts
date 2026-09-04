/**
 * The smallest Web Audio fake the synth engine can be exercised against.
 *
 * jsdom has no Web Audio at all, so without this the engine — the one part of
 * the app guaranteed to be making the sound, on every device, with no network
 * — has no test at all. The fake records what was built and what was
 * scheduled, which is enough to assert the shape of a voice.
 */

export class FakeParam {
  value: number
  readonly calls: { method: string; args: number[] }[] = []

  constructor(value = 0) {
    this.value = value
  }

  #record(method: string, args: number[]) {
    this.calls.push({ method, args })
    return this
  }

  setValueAtTime(value: number, time: number) {
    this.value = value
    return this.#record('setValueAtTime', [value, time])
  }
  linearRampToValueAtTime(value: number, time: number) {
    return this.#record('linearRampToValueAtTime', [value, time])
  }
  exponentialRampToValueAtTime(value: number, time: number) {
    return this.#record('exponentialRampToValueAtTime', [value, time])
  }
  setTargetAtTime(value: number, time: number, constant: number) {
    return this.#record('setTargetAtTime', [value, time, constant])
  }
  cancelScheduledValues(time: number) {
    return this.#record('cancelScheduledValues', [time])
  }
}

class FakeNode {
  readonly connections: FakeNode[] = []
  disconnected = 0

  connect(target: FakeNode) {
    this.connections.push(target)
    return target
  }
  disconnect() {
    this.disconnected++
  }
}

export class FakeGain extends FakeNode {
  readonly gain = new FakeParam(1)
}

export class FakeFilter extends FakeNode {
  type = 'lowpass'
  readonly frequency = new FakeParam(350)
  readonly Q = new FakeParam(1)
}

export class FakeOscillator extends FakeNode {
  type = 'sine'
  readonly frequency = new FakeParam(440)
  readonly detune = new FakeParam(0)
  started: number | null = null
  stopped: number | null = null

  start(time = 0) {
    this.started = time
  }
  stop(time = 0) {
    // Real nodes throw on a second stop; the engine relies on that being safe
    // to attempt, so the fake throws too.
    if (this.stopped !== null) throw new Error('already stopped')
    this.stopped = time
  }
}

export class FakeBufferSource extends FakeNode {
  buffer: unknown = null
  started: number | null = null
  stopped: number | null = null

  start(time = 0) {
    this.started = time
  }
  stop(time = 0) {
    if (this.stopped !== null) throw new Error('already stopped')
    this.stopped = time
  }
}

export class FakeAudioContext {
  currentTime = 0
  readonly sampleRate = 48000
  readonly destination = new FakeNode()

  readonly gains: FakeGain[] = []
  readonly filters: FakeFilter[] = []
  readonly oscillators: FakeOscillator[] = []
  readonly bufferSources: FakeBufferSource[] = []

  createGain() {
    const node = new FakeGain()
    this.gains.push(node)
    return node
  }
  createBiquadFilter() {
    const node = new FakeFilter()
    this.filters.push(node)
    return node
  }
  createOscillator() {
    const node = new FakeOscillator()
    this.oscillators.push(node)
    return node
  }
  createBufferSource() {
    const node = new FakeBufferSource()
    this.bufferSources.push(node)
    return node
  }
  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length)
    return { getChannelData: () => data, length }
  }

  /** Moves the clock so scheduling assertions can talk about "later". */
  advance(seconds: number) {
    this.currentTime += seconds
  }
}
