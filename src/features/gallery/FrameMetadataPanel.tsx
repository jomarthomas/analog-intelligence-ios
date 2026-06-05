/**
 * src/features/gallery/FrameMetadataPanel.tsx
 *
 * Read-only capture-metadata readout + an editable free-text note for a single
 * frame, shown inside the gallery detail view.
 *
 * Capture fields come from ScannedImage.captureMetadata (exposure time as a
 * 1/x shutter string, aperture, ISO, focal length, format). The note edits
 * ScannedImage.frameNote and persists via updateImageNote(); the store row is
 * refreshed so the change is reflected everywhere.
 *
 * Presentational + theme-driven (black & white app).
 */

import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';
import { updateImageNote } from '@/storage';
import type { CaptureMetadata, ScannedImage } from '@/storage';

// ---------------------------------------------------------------------------
// Capture-metadata formatting (pure)
// ---------------------------------------------------------------------------

/** Format an exposure time in seconds as a shutter-speed string. */
export function formatShutter(seconds: number | undefined): string | undefined {
  if (seconds === undefined || seconds <= 0) return undefined;
  if (seconds >= 1) return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}s`;
  return `1/${Math.round(1 / seconds)}s`;
}

interface MetaItem {
  label: string;
  value: string;
}

/** Build the display rows for the capture metadata that is actually present. */
export function buildMetaItems(m: CaptureMetadata): MetaItem[] {
  const items: MetaItem[] = [];
  const shutter = formatShutter(m.exposureTime);
  if (shutter) items.push({ label: 'Shutter', value: shutter });
  if (m.aperture !== undefined) items.push({ label: 'Aperture', value: `f/${m.aperture}` });
  if (m.iso !== undefined) items.push({ label: 'ISO', value: String(m.iso) });
  if (m.focalLength !== undefined) items.push({ label: 'Focal', value: `${m.focalLength}mm` });
  items.push({ label: 'Format', value: m.format.toUpperCase() });
  return items;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export type FrameMetadataPanelProps = {
  image: ScannedImage;
  /** Called after the note is persisted so the parent can refresh store state. */
  onNoteSaved?: () => void;
};

export function FrameMetadataPanel({ image, onNoteSaved }: FrameMetadataPanelProps) {
  const theme = useTheme();

  const [note, setNote] = useState(image.frameNote ?? '');
  const [saving, setSaving] = useState(false);

  // Re-seed the editable note when the frame (or its persisted note) changes,
  // using the "adjust state during render" pattern rather than an effect.
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const seedKey = `${image.id}:${image.frameNote ?? ''}`;
  const [lastSeedKey, setLastSeedKey] = useState(seedKey);
  if (seedKey !== lastSeedKey) {
    setLastSeedKey(seedKey);
    setNote(image.frameNote ?? '');
  }

  const items = buildMetaItems(image.captureMetadata);
  const dirty = (note.trim() || undefined) !== (image.frameNote?.trim() || undefined);

  const handleSaveNote = async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      await updateImageNote(image.id, note.trim() || undefined);
      onNoteSaved?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Capture metadata chips */}
      {items.length > 0 && (
        <View style={styles.metaGrid}>
          {items.map((item) => (
            <View
              key={item.label}
              style={[styles.metaChip, { backgroundColor: theme.backgroundElevated, borderColor: theme.divider }]}>
              <Text style={[styles.metaLabel, { color: theme.textTertiary }]}>{item.label}</Text>
              <Text style={[styles.metaValue, { color: theme.text }]}>{item.value}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Editable frame note */}
      <Text style={[styles.noteLabel, { color: theme.textTertiary }]}>FRAME NOTE</Text>
      <TextInput
        value={note}
        onChangeText={setNote}
        onBlur={() => void handleSaveNote()}
        placeholder="Add a note for this frame"
        placeholderTextColor={theme.textTertiary}
        multiline
        autoCapitalize="sentences"
        style={[
          styles.noteInput,
          { color: theme.text, backgroundColor: theme.backgroundElevated, borderColor: theme.divider },
        ]}
      />
      <Text style={[styles.noteHint, { color: theme.textTertiary }]}>
        {saving ? 'Saving…' : dirty ? 'Tap away to save' : 'Saved'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  metaChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 64,
  },
  metaLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    letterSpacing: 0.4,
  },
  metaValue: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  noteLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.8,
    marginTop: Spacing.xs,
  },
  noteInput: {
    fontSize: FontSize.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 64,
    textAlignVertical: 'top',
  },
  noteHint: {
    fontSize: FontSize.xs,
  },
});
