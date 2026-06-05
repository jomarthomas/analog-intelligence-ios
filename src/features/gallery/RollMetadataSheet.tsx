/**
 * src/features/gallery/RollMetadataSheet.tsx
 *
 * Modal sheet for editing a roll's (ScanSession's) metadata:
 *   name, film stock (brand), film type, box ISO, exposure index (EI),
 *   camera, lens, shot date, and notes.
 *
 * Persists through the gallery store (`updateSession` → repository). Also
 * surfaces the roll-level metadata sidecar exports (JSON manifest + CSV) since
 * this is the natural place a user reviews a whole roll.
 *
 * Implemented as a React Native <Modal> rather than a router screen so it can
 * be opened from the gallery tab and from roll section headers without adding a
 * nested route (which would require typed-route regeneration). Presentational +
 * theme-driven; no hardcoded colour.
 */

import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { Button } from '@/theme/button';
import { FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';
import { useGalleryStore } from '@/state/galleryStore';
import { updateSession as repoUpdateSession } from '@/storage';
import type { FilmType, ProcessParamsSnapshot, ScanSession, ScannedImage } from '@/storage';

import { exportRollSidecarCsv, exportRollSidecarJson } from './metadataSidecar';

// ---------------------------------------------------------------------------
// "Apply look to roll" — pick the source frame whose look gets synced
// ---------------------------------------------------------------------------

/**
 * The "source look" for a roll is the most-recently-edited frame that actually
 * has a processParams snapshot (i.e. the look the user last dialled in). Frames
 * are compared by `updatedAt` (ISO-8601, lexicographically sortable). Returns
 * undefined when no frame in the roll has been adjusted yet.
 */
function pickSourceLookFrame(frames: ScannedImage[]): ScannedImage | undefined {
  let best: ScannedImage | undefined;
  for (const frame of frames) {
    if (frame.processParams === undefined) continue;
    if (best === undefined || frame.updatedAt > best.updatedAt) {
      best = frame;
    }
  }
  return best;
}

/** Local UI state for an in-flight apply-to-roll run. */
interface ApplyProgress {
  current: number;
  total: number;
}

// Stable empty array so the derived `sessionImages` keeps a constant reference
// when no roll is open (avoids new-array churn in render).
const EMPTY_IMAGES: ScannedImage[] = [];

// ---------------------------------------------------------------------------
// Film-type options (mirrors the FilmType enum in storage/models)
// ---------------------------------------------------------------------------

const FILM_TYPES: { value: FilmType; label: string }[] = [
  { value: 'colorNegative', label: 'C-41' },
  { value: 'colorSlide', label: 'E-6' },
  { value: 'blackAndWhite', label: 'B&W' },
  { value: 'infrared', label: 'IR' },
  { value: 'unknown', label: 'Other' },
];

// ---------------------------------------------------------------------------
// Editable form shape (all strings — parsed on save)
// ---------------------------------------------------------------------------

interface FormState {
  name: string;
  filmBrand: string;
  filmType: FilmType | undefined;
  filmSpeed: string;
  exposureIndex: string;
  camera: string;
  lens: string;
  shotDate: string;
  notes: string;
}

function toForm(session: ScanSession): FormState {
  return {
    name: session.name,
    filmBrand: session.filmBrand ?? '',
    filmType: session.filmType,
    filmSpeed: session.filmSpeed !== undefined ? String(session.filmSpeed) : '',
    exposureIndex: session.exposureIndex !== undefined ? String(session.exposureIndex) : '',
    camera: session.camera ?? '',
    lens: session.lens ?? '',
    shotDate: session.shotDate ? session.shotDate.slice(0, 10) : '', // YYYY-MM-DD
    notes: session.notes ?? '',
  };
}

/** Parse a non-negative integer field; undefined when blank/invalid. */
function parseIntField(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const n = Number.parseInt(trimmed, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Parse a YYYY-MM-DD field into an ISO timestamp; undefined when blank/invalid. */
function parseDateField(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return undefined;
  const d = new Date(`${trimmed}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Empty string → undefined, else the trimmed value. */
function orUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export type RollMetadataSheetProps = {
  /** The session id to edit; null/undefined closes the sheet. */
  sessionId: string | null;
  /** Close handler. */
  onClose: () => void;
};

export function RollMetadataSheet({ sessionId, onClose }: RollMetadataSheetProps) {
  const theme = useTheme();

  // IMPORTANT: select the stable store arrays and derive locally. Returning a
  // fresh `.filter()`/`[]` directly from a zustand selector makes
  // useSyncExternalStore see a new snapshot every render → infinite re-render
  // ("Maximum update depth exceeded").
  const allSessions = useGalleryStore((s) => s.allSessions);
  const allImages = useGalleryStore((s) => s.allImages);
  const session = useMemo(
    () => (sessionId ? allSessions.find((x) => x.id === sessionId) : undefined),
    [allSessions, sessionId],
  );
  const sessionImages = useMemo(
    () =>
      sessionId ? allImages.filter((img) => img.sessionId === sessionId) : EMPTY_IMAGES,
    [allImages, sessionId],
  );
  // Persist the full (extended) roll metadata through the repository, then
  // refresh the store so in-memory state matches. The store's own
  // `updateSession` only accepts a narrower field set, so we go direct to the
  // repository (which we extended) and reconcile via `refreshSession`.
  const refreshSession = useGalleryStore((s) => s.refreshSession);
  // Store action that re-renders every frame in the roll with one look.
  const applyParamsToRoll = useGalleryStore((s) => s.applyParamsToRoll);

  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  // In-flight apply-to-roll progress (null = not running).
  const [applyProgress, setApplyProgress] = useState<ApplyProgress | null>(null);
  // AbortController for cancelling an in-flight apply-to-roll run.
  const applyAbortRef = useRef<AbortController | null>(null);

  // Re-seed the form whenever a different roll is opened, or the underlying
  // session changes (e.g. after a save → refresh). Keyed on id+updatedAt so
  // in-progress edits within the same open session aren't clobbered. Uses the
  // "adjust state during render" pattern instead of an effect.
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const seedKey = session ? `${session.id}:${session.updatedAt}` : null;
  const [lastSeedKey, setLastSeedKey] = useState<string | null>(seedKey);
  if (seedKey !== lastSeedKey) {
    setLastSeedKey(seedKey);
    setForm(session ? toForm(session) : null);
  }

  const visible = sessionId !== null && session !== undefined && form !== null;

  // Order frames by the roll's canonical imageIds so manifests are in shot order.
  const orderedImages = useMemo(() => {
    if (!session) return sessionImages;
    const byId = new Map(sessionImages.map((img) => [img.id, img]));
    const ordered = session.imageIds
      .map((id) => byId.get(id))
      .filter((img): img is (typeof sessionImages)[number] => img !== undefined);
    // Include any frames not yet in imageIds (defensive) at the end.
    const seen = new Set(ordered.map((img) => img.id));
    return [...ordered, ...sessionImages.filter((img) => !seen.has(img.id))];
  }, [session, sessionImages]);

  // The frame whose look ("most-recently-edited") will be synced to the roll.
  // Undefined until at least one frame in the roll has been adjusted.
  const sourceLookFrame = useMemo(
    () => pickSourceLookFrame(orderedImages),
    [orderedImages],
  );

  if (!visible || form === null || session === undefined) {
    // Modal must still mount to animate out; render an empty transparent one.
    return <Modal visible={false} transparent onRequestClose={onClose} />;
  }

  const patch = (next: Partial<FormState>) => setForm((f) => (f ? { ...f, ...next } : f));

  // -------------------------------------------------------------------------
  // Apply look to roll
  // -------------------------------------------------------------------------

  /** Run the apply-to-roll service with progress + cancellation, then report. */
  const runApplyLook = async (look: ProcessParamsSnapshot, sourceId: string) => {
    const controller = new AbortController();
    applyAbortRef.current = controller;
    setApplyProgress({ current: 0, total: orderedImages.length });
    try {
      const result = await applyParamsToRoll(session.id, look, {
        signal: controller.signal,
        // The source frame already has this exact look — don't re-render it.
        skipImageId: sourceId,
        onProgress: ({ current, total }) => setApplyProgress({ current, total }),
      });

      // Result toast/alert — mirrors the batch-export summary phrasing.
      if (result.cancelled) {
        Alert.alert(
          'Stopped',
          `Applied the look to ${result.succeeded} ${result.succeeded === 1 ? 'frame' : 'frames'} before stopping.`,
        );
      } else if (result.failed === 0) {
        Alert.alert(
          'Look applied',
          `Re-rendered ${result.succeeded} ${result.succeeded === 1 ? 'frame' : 'frames'} with this look.`,
        );
      } else if (result.succeeded > 0) {
        Alert.alert(
          'Partly applied',
          `Re-rendered ${result.succeeded}, ${result.failed} failed.${
            result.failures[0] ? `\n${result.failures[0].message}` : ''
          }`,
        );
      } else {
        Alert.alert(
          'Could not apply look',
          result.failures[0]?.message ?? 'No frames were re-rendered.',
        );
      }
    } finally {
      applyAbortRef.current = null;
      setApplyProgress(null);
    }
  };

  const handleApplyLook = () => {
    if (sourceLookFrame === undefined || sourceLookFrame.processParams === undefined) {
      Alert.alert(
        'No look to apply',
        'Adjust at least one frame in this roll first, then sync its look to the others.',
      );
      return;
    }
    // Every frame except the source gets re-rendered.
    const targetCount = Math.max(orderedImages.length - 1, 0);
    if (targetCount === 0) {
      Alert.alert('Nothing to sync', 'This roll only has the frame you adjusted.');
      return;
    }

    const look = sourceLookFrame.processParams;
    const sourceId = sourceLookFrame.id;
    Alert.alert(
      'Apply look to roll?',
      `This re-renders all ${targetCount} other ${targetCount === 1 ? 'frame' : 'frames'} in “${session.name}” with the look from your most recently edited frame. Existing edits on those frames will be replaced.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Apply',
          style: 'destructive',
          onPress: () => {
            void runApplyLook(look, sourceId);
          },
        },
      ],
    );
  };

  const handleSave = async () => {
    const name = form.name.trim();
    if (name.length === 0) {
      Alert.alert('Roll name required', 'Give this roll a name before saving.');
      return;
    }
    setSaving(true);
    try {
      await repoUpdateSession(session.id, {
        name,
        filmBrand: orUndefined(form.filmBrand),
        filmType: form.filmType,
        filmSpeed: parseIntField(form.filmSpeed),
        exposureIndex: parseIntField(form.exposureIndex),
        camera: orUndefined(form.camera),
        lens: orUndefined(form.lens),
        shotDate: parseDateField(form.shotDate),
        notes: orUndefined(form.notes),
      });
      await refreshSession(session.id);
      onClose();
    } catch (err) {
      Alert.alert('Could not save', err instanceof Error ? err.message : 'Failed to update roll.');
    } finally {
      setSaving(false);
    }
  };

  const handleExportManifest = (kind: 'json' | 'csv') => {
    void (async () => {
      const result =
        kind === 'json'
          ? await exportRollSidecarJson(session, orderedImages)
          : await exportRollSidecarCsv(session, orderedImages);
      if (!result.ok) {
        Alert.alert('Export failed', result.message);
      }
    })();
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.divider }]}>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={[styles.headerAction, { color: theme.textSecondary }]}>Cancel</Text>
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Roll details</Text>
          <Pressable onPress={() => void handleSave()} hitSlop={8} disabled={saving}>
            <Text style={[styles.headerAction, { color: theme.accent, fontWeight: FontWeight.semibold }]}>
              {saving ? 'Saving…' : 'Save'}
            </Text>
          </Pressable>
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <Field
              label="Roll name"
              value={form.name}
              onChangeText={(t) => patch({ name: t })}
              placeholder="e.g. Portugal 2026"
              autoFocus
            />

            <Field
              label="Film stock"
              value={form.filmBrand}
              onChangeText={(t) => patch({ filmBrand: t })}
              placeholder="e.g. Kodak Portra"
            />

            <FieldLabel>Process</FieldLabel>
            <View style={styles.chipRow}>
              {FILM_TYPES.map(({ value, label }) => {
                const active = form.filmType === value;
                return (
                  <Pressable
                    key={value}
                    onPress={() => patch({ filmType: active ? undefined : value })}
                    style={[
                      styles.chip,
                      { borderColor: theme.divider },
                      active && { backgroundColor: theme.accent, borderColor: theme.accent },
                    ]}>
                    <Text
                      style={[
                        styles.chipLabel,
                        { color: active ? theme.accentText : theme.textSecondary },
                      ]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.twoCol}>
              <View style={styles.col}>
                <Field
                  label="Box ISO"
                  value={form.filmSpeed}
                  onChangeText={(t) => patch({ filmSpeed: t })}
                  placeholder="400"
                  keyboardType="number-pad"
                />
              </View>
              <View style={styles.col}>
                <Field
                  label="Shot at (EI)"
                  value={form.exposureIndex}
                  onChangeText={(t) => patch({ exposureIndex: t })}
                  placeholder="e.g. 800"
                  keyboardType="number-pad"
                />
              </View>
            </View>

            <Field
              label="Camera"
              value={form.camera}
              onChangeText={(t) => patch({ camera: t })}
              placeholder="e.g. Nikon FM2"
            />

            <Field
              label="Lens"
              value={form.lens}
              onChangeText={(t) => patch({ lens: t })}
              placeholder="e.g. 50mm f/1.8"
            />

            <Field
              label="Shot date"
              value={form.shotDate}
              onChangeText={(t) => patch({ shotDate: t })}
              placeholder="YYYY-MM-DD"
              keyboardType="numbers-and-punctuation"
            />

            <Field
              label="Notes"
              value={form.notes}
              onChangeText={(t) => patch({ notes: t })}
              placeholder="Anything worth remembering about this roll"
              multiline
            />

            {/* Apply look to roll — sync one frame's adjustments to all frames */}
            <Text style={[styles.sectionLabel, { color: theme.textTertiary }]}>
              APPLY LOOK TO ROLL
            </Text>
            {applyProgress !== null ? (
              <View
                style={[
                  styles.progressCard,
                  { backgroundColor: theme.backgroundElevated, borderColor: theme.divider },
                ]}>
                <View style={styles.progressRow}>
                  <ActivityIndicator size="small" color={theme.accent} />
                  <Text style={[styles.progressText, { color: theme.text }]}>
                    {applyProgress.current > 0
                      ? `Applying to frame ${applyProgress.current} of ${applyProgress.total}…`
                      : 'Preparing…'}
                  </Text>
                </View>
                <Pressable
                  onPress={() => applyAbortRef.current?.abort()}
                  hitSlop={8}
                  style={styles.progressStop}>
                  <Text style={[styles.progressStopLabel, { color: theme.accent }]}>Stop</Text>
                </Pressable>
              </View>
            ) : (
              <Button
                variant="primary"
                size="sm"
                style={styles.applyButton}
                disabled={sourceLookFrame === undefined}
                onPress={handleApplyLook}>
                Apply look to roll
              </Button>
            )}
            <Text style={[styles.exportHint, { color: theme.textTertiary }]}>
              {sourceLookFrame === undefined
                ? 'Adjust a frame in this roll, then sync its look to every other frame.'
                : `Re-renders every frame with the adjustments from your most recently edited frame (${orderedImages.length === 1 ? '1 frame' : `${orderedImages.length} frames`}).`}
            </Text>

            {/* Roll metadata export (sidecar manifests) */}
            <Text style={[styles.sectionLabel, { color: theme.textTertiary }]}>
              EXPORT ROLL METADATA
            </Text>
            <View style={styles.exportRow}>
              <Button
                variant="secondary"
                size="sm"
                style={styles.exportButton}
                onPress={() => handleExportManifest('json')}>
                JSON manifest
              </Button>
              <Button
                variant="secondary"
                size="sm"
                style={styles.exportButton}
                onPress={() => handleExportManifest('csv')}>
                CSV manifest
              </Button>
            </View>
            <Text style={[styles.exportHint, { color: theme.textTertiary }]}>
              Writes a metadata sidecar for all {orderedImages.length}{' '}
              {orderedImages.length === 1 ? 'frame' : 'frames'} and opens the share sheet.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Small internal field components (theme-driven)
// ---------------------------------------------------------------------------

function FieldLabel({ children }: { children: string }) {
  const theme = useTheme();
  return <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{children}</Text>;
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  autoFocus?: boolean;
  keyboardType?: React.ComponentProps<typeof TextInput>['keyboardType'];
};

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  autoFocus = false,
  keyboardType,
}: FieldProps) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <FieldLabel>{label}</FieldLabel>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textTertiary}
        autoFocus={autoFocus}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize="sentences"
        style={[
          styles.input,
          multiline && styles.inputMultiline,
          { color: theme.text, backgroundColor: theme.backgroundElevated, borderColor: theme.divider },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
  },
  headerAction: {
    fontSize: FontSize.md,
  },
  scroll: {
    padding: Spacing.md,
    gap: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  field: {
    gap: Spacing.xs,
  },
  fieldLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  input: {
    fontSize: FontSize.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
  },
  inputMultiline: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  twoCol: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  col: {
    flex: 1,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.8,
    marginTop: Spacing.md,
  },
  exportRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  exportButton: {
    flex: 1,
  },
  exportHint: {
    fontSize: FontSize.xs,
    lineHeight: FontSize.xs * 1.5,
  },
  applyButton: {
    alignSelf: 'flex-start',
  },
  progressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.md,
  },
  progressRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  progressText: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  progressStop: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  progressStopLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
});
