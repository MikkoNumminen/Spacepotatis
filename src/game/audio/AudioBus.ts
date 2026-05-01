"use client";

// AudioBus is the single source of truth for mute state across the audio
// cluster. Each engine registers itself with the bus under one of three
// categories (music / voice / sfx) and the bus calls back into the engine
// whenever the effective mute for that category flips.
//
// What it replaces:
//  - The `setAllMuted(muted: boolean)` hub in music.ts that lazy-imported
//    five sibling engines and called setMuted on each. Centralized
//    propagation, but blind to category and brittle in edge cases (the
//    dynamic import was a microtask that could race with rapid toggles).
//  - The per-engine `private muted = false; setMuted(muted) { ... }` storage
//    duplicated across six files. The bus owns the authoritative state;
//    engines just react.
//
// What it enables:
//  - Master mute (every category off) — what the current MuteToggle wires.
//  - Per-category mute (music vs voice vs sfx) — UI not yet shipped, but
//    the data model supports it for the eventual category-slider work.
//  - One subscribe() surface for UI components that need to mirror the
//    mute state in a button or icon — replaces sfx.subscribe.
//
// Lifecycle:
//  - Engines register in their constructor (singletons born at module load).
//  - The bus calls `engine.setMuted(isMuted(category))` synchronously on
//    register so the engine boots in the right state.
//  - On every state change the bus fans out to every registered engine in
//    the affected categories.
//
// Mute is session-only. The bus does not read from or write to localStorage.
// See MuteToggle.tsx for the rationale.

export type AudioCategory = "music" | "voice" | "sfx";

export interface AudioBusEngine {
  setMuted(muted: boolean): void;
}

export interface AudioBusState {
  readonly masterMuted: boolean;
  readonly muted: {
    readonly music: boolean;
    readonly voice: boolean;
    readonly sfx: boolean;
  };
}

type Listener = (state: AudioBusState) => void;

class AudioBus {
  private masterMuted = false;
  private categoryMuted: { music: boolean; voice: boolean; sfx: boolean } = {
    music: false,
    voice: false,
    sfx: false
  };
  private readonly engines: {
    music: Set<AudioBusEngine>;
    voice: Set<AudioBusEngine>;
    sfx: Set<AudioBusEngine>;
  } = { music: new Set(), voice: new Set(), sfx: new Set() };
  private readonly listeners = new Set<Listener>();

  register(category: AudioCategory, engine: AudioBusEngine): () => void {
    this.engines[category].add(engine);
    // Sync the new engine to the current bus state. Without this, an engine
    // that boots after a mute toggle would start in the wrong state.
    engine.setMuted(this.isMuted(category));
    return () => {
      this.engines[category].delete(engine);
    };
  }

  isMasterMuted(): boolean {
    return this.masterMuted;
  }

  isMuted(category: AudioCategory): boolean {
    return this.masterMuted || this.categoryMuted[category];
  }

  setMasterMuted(muted: boolean): void {
    if (this.masterMuted === muted) return;
    const before = this.snapshotMutes();
    this.masterMuted = muted;
    this.applyDiff(before);
    this.notify();
  }

  setCategoryMuted(category: AudioCategory, muted: boolean): void {
    if (this.categoryMuted[category] === muted) return;
    const before = this.snapshotMutes();
    this.categoryMuted[category] = muted;
    this.applyDiff(before);
    this.notify();
  }

  getState(): AudioBusState {
    return {
      masterMuted: this.masterMuted,
      muted: { ...this.categoryMuted }
    };
  }

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    cb(this.getState());
    return () => {
      this.listeners.delete(cb);
    };
  }

  // Snapshot the per-category effective mute so applyDiff can fan out only
  // to the categories whose state actually changed (saves a round of redundant
  // setMuted calls when toggling master between two already-muted categories).
  private snapshotMutes(): { music: boolean; voice: boolean; sfx: boolean } {
    return {
      music: this.isMuted("music"),
      voice: this.isMuted("voice"),
      sfx: this.isMuted("sfx")
    };
  }

  private applyDiff(before: { music: boolean; voice: boolean; sfx: boolean }): void {
    for (const cat of ["music", "voice", "sfx"] as const) {
      const after = this.isMuted(cat);
      if (after === before[cat]) continue;
      for (const engine of this.engines[cat]) engine.setMuted(after);
    }
  }

  private notify(): void {
    const snap = this.getState();
    for (const cb of this.listeners) cb(snap);
  }
}

export const audioBus = new AudioBus();
