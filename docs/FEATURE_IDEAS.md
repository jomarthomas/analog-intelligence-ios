# Competitor-whitespace features — status

Ideas drawn from a competitive review (FilmBox, FilmLab, Negative Lab Pro,
SilverFast) — things the leaders do that mobile scanners don't. Tracking what's
shipped, scaffolded, or deferred (and why).

## Shipped

- **Before/after reveal slider** (Adjust) — drag to wipe between the raw negative
  and the processed positive. `src/features/adjust/BeforeAfterCompare.tsx`.
- **Actionable Insights** — the live histogram becomes a one-tap suggestion
  ("Shadows are clipping — lift them", "Looks flat — add contrast"…) on the
  Adjust screen. `src/insights/suggestions.ts` + the suggestion chip.
- **Faster live preview** — preview base renders at `maxDimension=1280`; the
  committed export stays full-res. (Snappier sliders, no Android OOM.)
- **Film-stock / lab looks** — Frontier/Noritsu/Portra/Gold/Ektar etc. as a chip
  picker (`src/processing/filmProfiles.ts`).
- **Apply look to whole roll** — sync one frame's correction across a roll (the
  NLP "sync settings" that no mobile scanner has). *(see agent workstream)*
- **One-tap white-balance from the film base** — neutralize using the unexposed
  rebate (a mobile take on IT8 calibration). *(native estimate + Adjust button)*
- **Multi-shot denoise** — `averageFrames()` means N aligned captures to cut
  sensor noise (a phone take on SilverFast Multi-Exposure). *(native scaffold)*

## Scaffolded (seam in place; needs more to be production-grade)

- **Multi-shot capture UI + frame alignment.** `averageFrames()` exists natively
  but assumes the frames are pre-aligned; handheld shots need an alignment pass
  (feature/ECC) before averaging. The Scan-screen "burst" capture that feeds it
  is the remaining UI work.
- **3D-LUT film emulation.** The engine has a no-op `applyLut` seam + an optional
  `lut` param; the current looks are slider approximations. Real Frontier/Noritsu
  fidelity needs `.cube` LUTs baked from reference scans + a native LUT sampler.
- **Manual dust/scratch spot-heal.** Phones have no IR channel (SilverFast iSRD),
  so the plan is a Skia-based tap-to-heal brush (react-native-skia is already a
  dep). Not yet built — flagged for a focused pass.

## Deferred (need infra / hardware / a dependency this env can't add)

- **Real-time capture guidance (level/tilt).** Needs `expo-sensors`
  (DeviceMotion), which isn't installed; adding it requires `npm install` (which
  would disturb the local native-build patches). The lighting-evenness/glare hint
  can be derived from the live histogram without a new dep — a good first step.
- **Desktop / web companion.** `react-native-web` + `src/processing/webFallback.ts`
  give a path, but the camera + Skia + MMKV native modules don't run on web, so a
  real companion is a separate app, not a flag.
- **BLE auto-roll-scan dock.** The simulated dock (`modules/dock-ble`) works;
  real hardware + on-device BLE verification is required to ship it.

## Positioning

Keep leaning on **one-time price · on-device · nothing leaves your phone** — it
directly answers the two loudest competitor complaints (subscription fatigue and
cloud/privacy).
