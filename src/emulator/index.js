import {
  BasicRetroAppWrapper,
  DisplayLoop,
  ScriptAudioProcessor,
  LOG,
  md5Uint8Array,
} from '@webrcade/app-common';

export class Emulator extends BasicRetroAppWrapper {

  constructor(app, debug = false) {
    super(app, debug);

    window.emulator = this;
    this.frameRate = 60;

    this.leftDifficulty = null;
    this.rightDifficulty = null;
    this.dualAnalog = null;

    const START_DELAY = 5;
    let started = 0;

    /* WRC begin: resampling audio callback
     * Original: audioCarry/total/count did not exist; audioCallback was:
     *   this.audioCallback = (offset, length) => {
     *     if (started === START_DELAY) { this.audioProcessor.start(); }
     *     else if (started < START_DELAY) { started++; return; }
     *     const audioArray = new Int16Array(window.Module.HEAP16.buffer, offset, 4096);
     *     this.audioProcessor.storeSoundCombinedInput(audioArray, 2, length << 1, 0, 28000);
     *   };
     * Problem: WASM output was TIA-compatible native ~31440 Hz, JS AudioContext
     * expects 48000 Hz. The mismatch caused poor audio quality (same issue fixed
     * in Stella - see webrcade-app-retro-stella/src/emulator/index.js).
     * Fix: frame-walking resampler with fractional carry, matching Stella exactly.
     */

    // Fractional sample carry
    this.audioCarry = 0;

    this.total = 0;
    this.count = 0;

    this.audioCallback = (offset, length) => {
      if (started === START_DELAY) {
        this.audioProcessor.start();
      } else if (started < START_DELAY) {
        started++;
        return;
      }

      // length = incoming frames (mono)
      this.count++;

      if (this.count >= this.frameRate) {
        this.total = 0;
        this.count = 0;
      }

      // ---- target frames this callback ----
      const exactFrames = (48000 + 15) / this.frameRate;
      const framesWithCarry = exactFrames + this.audioCarry;
      const outFrames = Math.floor(framesWithCarry);
      this.audioCarry = framesWithCarry - outFrames;

      // ---- input samples (stereo interleaved) ----
      const inSamples = length << 1;
      const input = new Int16Array(
        window.Module.HEAP16.buffer,
        offset,
        inSamples
      );

      // ---- output buffer (stereo interleaved) ----
      const outSamples = outFrames << 1;
      const output = new Int16Array(outSamples);

      // ---- frame walking resampler (no timing drift) ----
      const step = length / outFrames;

      let srcFrame = 0;
      for (let i = 0; i < outFrames; i++) {
        const si = (srcFrame | 0) << 1;

        output[i * 2]     = input[si];
        output[i * 2 + 1] = input[si + 1];

        srcFrame += step;
      }

      this.total += (outSamples >> 1);

      this.audioProcessor.storeSoundCombinedInput(
        output,
        2,
        outSamples,
        0,
        28000 /*((65535 >> 1) | 0)*/
      );
    };
    /* WRC end */
  }

  setPal(pal) {
    if (pal) {
      this.setFrameRate(50);
    }
  }

  onFrame() {
    // Touch/mouse/keyboard interaction detection + on-screen touch overlay
    // gating is inherited from BasicRetroAppWrapper. This app has no other
    // per-frame work of its own (audio start-up is handled inline in the
    // audioCallback's START_DELAY counter above, not here).
    super.onFrame();
  }

  // Base class default pauses on any tap anywhere on screen -- redundant
  // (and disruptive) now that there's a dedicated Pause button in the
  // touch overlay. Same override every other TouchOverlay app uses for
  // the same reason.
  createTouchListener() {}

  createAudioProcessor() {
    return new ScriptAudioProcessor(
      2,
      48000,
      8192 + 4096,
      2048,
    ).setDebug(this.debug);
  }

  setFrameRate(rate) {
    LOG.info("## frame rate set to: " + rate);
    this.frameRate = rate;
  }

  createDisplayLoop(debug) {
    return new DisplayLoop(this.frameRate, true, debug, false, false);
  }

  getScriptUrl() {
    return 'js/prosystem_libretro.js';
  }

  // RetroArch's stock RA hashing isn't stripping the 128-byte .a78 header
  // in this build, so compute it client-side, mirroring rc_hash_7800() in
  // rcheevos exactly: strip the header (magic "ATARI7800" at offset 1) and
  // MD5 the remaining cart data. Same pattern as melonDS's getRaHash(),
  // which pre-computes its own hash for a non-standard case.
  computeRaHash(romBytes) {
    const bytes = romBytes instanceof Uint8Array ? romBytes : new Uint8Array(romBytes);
    let data = bytes;

    if (bytes.length > 128 &&
        String.fromCharCode.apply(null, bytes.subarray(1, 10)) === 'ATARI7800') {
      const header = bytes.subarray(0, 128);
      data = bytes.subarray(128);

      // Rikki & Vikki "combined dump": a SOUPER cart (header[53] === 16)
      // where the file is the real 512K cart plus an appended 512K BupChip
      // music blob (see Cartridge.c's SOUPER combined-dump detection).
      // RA's registered hash is for the real cart alone, so only hash the
      // first half in that specific case.
      if (header[53] === 16 && data.length === 1024 * 1024) {
        data = data.subarray(0, 512 * 1024);
      }
    }

    return md5Uint8Array(data);
  }

  getRaHash() {
    return this.raHash || null;
  }

  setRoms(uid, frontendArray, biosBuffers, romBytes, ext) {
    this.raHash = null;
    if (romBytes) {
      this.raHash = this.computeRaHash(romBytes);
      LOG.info(`[Prosystem RA Hash] ${this.raHash}`);
    }
    super.setRoms(uid, frontendArray, biosBuffers, romBytes, ext);
  }

  getPrefs() {
    return this.prefs;
  }

  async saveState() {
  }

  isEscapeHackEnabled() {
    return false;
  }

  async loadState() {
    // Check cloud storage (eliminate delay when showing settings)
    try {
      await this.getSaveManager().isCloudEnabled(this.loadMessageCallback);
    } finally {
      this.loadMessageCallback(null);
    }
  }

  getLeftDifficulty() {
    if (this.leftDifficulty === null) {
      this.leftDifficulty = true; // hardware default: "B" (Beginner)
    }
    return this.leftDifficulty ? "b" : "a";
  }

  setLeftDifficulty(v) {
    this.leftDifficulty = (v === "b");
    this.applyGameSettings();
  }

  getRightDifficulty() {
    if (this.rightDifficulty === null) {
      this.rightDifficulty = false; // hardware default: "A" (Advanced), fixes Tower Toppler
    }
    return this.rightDifficulty ? "b" : "a";
  }

  setRightDifficulty(v) {
    this.rightDifficulty = (v === "b");
    this.applyGameSettings();
  }

  isDualAnalog() {
    return this.dualAnalog ? true : false;
  }

  setDualAnalog(v) {
    this.dualAnalog = v;
    this.applyGameSettings();
  }

  applyGameSettings() {
    const { Module } = window;
    const props = this.getProps();

    console.log(props);

    if (this.leftDifficulty === null) {
      this.leftDifficulty = true;
    }
    if (this.rightDifficulty === null) {
      this.rightDifficulty = false;
    }
    if (this.dualAnalog === null) {
      this.dualAnalog = false;
    }

    let options = 0;
    if (this.leftDifficulty) {
      options |= this.OPT1;
    }
    if (this.rightDifficulty) {
      options |= this.OPT2;
    }
    if (this.dualAnalog) {
      options |= this.OPT3;
    }

    Module._wrc_set_options(options);
  }

  isForceAspectRatio() {
    return false;
  }

  getDefaultAspectRatio() {
    return 1.333;
  }

  resizeScreen(canvas) {
    this.canvas = canvas;
    this.updateScreenSize();
  }

  getShotAspectRatio() { return this.getDefaultAspectRatio(); }
}
