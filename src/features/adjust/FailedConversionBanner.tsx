/**
 * src/features/adjust/FailedConversionBanner.tsx
 *
 * POST-CAPTURE COACHING (the #1 scanner failure recovery).
 *
 * THE PROBLEM IT SOLVES:
 *   The user holds a film negative in front of a window; the film is small in the
 *   frame and the bright room dominates. If detection misses and the engine ends
 *   up processing the room, the Adjust screen shows a confusing near-BLACK (or
 *   blown-white) image with no explanation. The user is stuck and frustrated.
 *
 * WHAT THIS DOES:
 *   We already analyse the live preview's luma histogram on the Adjust screen
 *   (`analyzeHistogram` → `lumaStats`). When that histogram is DEGENERATE — almost
 *   every pixel piled at pure black OR pure white, OR with essentially no tonal
 *   range — the conversion didn't produce a real photo. Instead of leaving the
 *   user to puzzle over a blank, we surface a friendly, actionable banner over the
 *   preview: a short headline, the concrete fix, and a **Retake** button that
 *   jumps back to the Scan tab. It's dismissible (some scans are legitimately very
 *   dark/light, and the user stays in control).
 *
 * The detector (`isFailedConversion`) is a pure function of the luma bins so it's
 * trivially testable and cheap to run on every preview update.
 *
 * On-brand: pure black & white, theme tokens only — no colour is introduced.
 */

import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';
import { lumaStats } from '@/insights';

// ---------------------------------------------------------------------------
// Detection — pure, testable
// ---------------------------------------------------------------------------

/**
 * Fraction of pixels piled in the extreme bins (pure black + pure white) above
 * which we consider the image degenerate. A real photo spreads tone across the
 * range; a processed-room frame collapses almost everything to one extreme.
 */
export const DEGENERATE_EXTREME_FRACTION = 0.65;

/**
 * Minimum occupied tonal range. Below this the image has essentially no tonal
 * content (a flat near-single-value frame), i.e. no real picture was produced.
 */
export const DEGENERATE_MIN_OCCUPIED_RANGE = 0.12;

/**
 * Number of bins at each end of a 256-bin histogram treated as "pure" black or
 * white. We allow a tiny cushion (not just bin 0 / bin 255) so sensor noise and
 * JPEG rounding around the clip points still count as clipped, while a genuine
 * photo's deepest shadow / brightest highlight does not dominate this many bins.
 */
const EXTREME_BIN_SPAN = 3;

/**
 * Sum the normalised mass piled at the extreme bins. `luma` bins already sum to
 * ~1 (native returns normalised bins; see `analyzeHistogram`), so the two
 * fractions are directly comparable to {@link DEGENERATE_EXTREME_FRACTION}.
 * Returns the larger of the black-pile and white-pile fractions.
 */
export function extremePileFraction(luma: readonly number[]): number {
  const bins = luma.length;
  if (bins < 16) return 0;

  let total = 0;
  let blackPile = 0;
  let whitePile = 0;
  const span = Math.min(EXTREME_BIN_SPAN, Math.floor(bins / 2));

  for (let i = 0; i < bins; i += 1) {
    const v = luma[i] ?? 0;
    total += v;
    if (i < span) blackPile += v;
    if (i >= bins - span) whitePile += v;
  }
  if (total <= 0) return 0;

  return Math.max(blackPile, whitePile) / total;
}

/**
 * Decide whether the conversion FAILED to produce a usable photo from this luma
 * histogram. Pure + total so it can be unit-tested without the native module.
 *
 * Failed when EITHER:
 *   • > {@link DEGENERATE_EXTREME_FRACTION} of pixels are piled at pure black OR
 *     pure white (the room blew out / went to mud), OR
 *   • the occupied tonal range is below {@link DEGENERATE_MIN_OCCUPIED_RANGE}
 *     (no real tonal content — a flat, near-single-value frame).
 *
 * Returns false for `null`/`undefined`/too-short input so we never flag a scan
 * before a histogram exists.
 */
export function isFailedConversion(luma: readonly number[] | null | undefined): boolean {
  if (!luma || luma.length < 16) return false;

  if (extremePileFraction(luma) > DEGENERATE_EXTREME_FRACTION) return true;

  // `lumaStats` accepts a plain number[]; the readonly view is fine to pass.
  const s = lumaStats(luma as number[]);
  if (s == null) return false;

  return s.occupiedRange < DEGENERATE_MIN_OCCUPIED_RANGE;
}

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------

export type FailedConversionBannerProps = {
  /** Jump back to the Scan tab to re-shoot. */
  onRetake: () => void;
  /** Hide the banner — the user accepts this scan as-is. */
  onDismiss: () => void;
};

const HEADLINE = "This scan didn't convert";
const BODY =
  'Fill the frame with ONE negative frame, use an even light source — a lightbox ' +
  'or a white screen, not a window — and get close.';

function FailedConversionBannerImpl({ onRetake, onDismiss }: FailedConversionBannerProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: theme.backgroundElevated, borderColor: theme.border },
      ]}
      accessibilityRole="alert">
      <View style={styles.headerRow}>
        <Text style={[styles.headline, { color: theme.text }]}>{HEADLINE}</Text>
        <Pressable
          onPress={onDismiss}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Dismiss">
          <Text style={[styles.dismiss, { color: theme.textSecondary }]}>✕</Text>
        </Pressable>
      </View>

      <Text style={[styles.body, { color: theme.textSecondary }]}>{BODY}</Text>

      <Pressable
        onPress={onRetake}
        accessibilityRole="button"
        accessibilityLabel="Retake the scan"
        style={({ pressed }) => [
          styles.retake,
          { backgroundColor: theme.accent },
          pressed && styles.retakePressed,
        ]}>
        <Text style={[styles.retakeText, { color: theme.accentText }]}>Retake</Text>
      </Pressable>
    </View>
  );
}

export const FailedConversionBanner = memo(FailedConversionBannerImpl);

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  banner: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  headline: {
    flex: 1,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.2,
  },
  dismiss: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  body: {
    fontSize: FontSize.sm,
    lineHeight: FontSize.sm * 1.4,
  },
  retake: {
    alignSelf: 'flex-start',
    marginTop: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.full,
  },
  retakePressed: {
    opacity: 0.8,
  },
  retakeText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.3,
  },
});
