/**
 * src/components/lightbox-modal.tsx
 *
 * Turns the device screen into a backlight for scanning negatives — for when
 * you don't have a dedicated light pad. Lay the negative on the screen and
 * photograph it with a second device, or run this on a spare phone as the
 * light source behind a held strip.
 *
 * A clean, even, high-CRI light is what makes colour scans accurate (see the
 * scanning-guide research), so the panel is full-white by default with a
 * neutral→warm tint control. We keep the screen awake while it's open; on
 * platforms with `expo-brightness` you'd also force max brightness (not a
 * dependency here — the on-screen hint tells the user to do it manually).
 *
 * Implemented as a self-contained <Modal> (no new route) so it can be launched
 * from anywhere with a boolean.
 */

import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { useKeepAwake } from 'expo-keep-awake';

import { FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';

type LightboxModalProps = {
  visible: boolean;
  onClose: () => void;
};

/**
 * Map a warmth value (-1 cool … 0 neutral … +1 warm) to an RGB panel colour.
 * Neutral is pure white (≈D65 screen point); warm adds amber, cool adds blue —
 * a small ±18/255 shift so it stays a usable bright light.
 */
function panelColor(warmth: number): string {
  const shift = Math.round(Math.abs(warmth) * 18);
  if (warmth >= 0) {
    // Warmer: keep R, drop B (and a touch of G).
    return `rgb(255, ${255 - Math.round(shift * 0.4)}, ${255 - shift})`;
  }
  // Cooler: drop R (and a touch of G).
  return `rgb(${255 - shift}, ${255 - Math.round(shift * 0.4)}, 255)`;
}

function LightboxContent({ onClose }: { onClose: () => void }) {
  useKeepAwake();
  const [warmth, setWarmth] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);

  return (
    <Pressable
      style={[styles.panel, { backgroundColor: panelColor(warmth) }]}
      onPress={() => setControlsVisible((v) => !v)}>
      {controlsVisible ? (
        <View style={styles.controls}>
          <Text style={styles.hint}>
            Lightbox · set your screen brightness to maximum, lay the negative on
            the screen, and photograph it with another device. Tap to hide.
          </Text>

          <View style={styles.sliderRow}>
            <Text style={styles.sliderLabel}>Cool</Text>
            <Slider
              style={styles.slider}
              value={warmth}
              minimumValue={-1}
              maximumValue={1}
              step={0.05}
              onValueChange={setWarmth}
              minimumTrackTintColor="#000000"
              maximumTrackTintColor="#000000"
              thumbTintColor="#000000"
            />
            <Text style={styles.sliderLabel}>Warm</Text>
          </View>

          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close lightbox"
            style={({ pressed }) => [styles.closeButton, pressed && { opacity: 0.7 }]}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
      ) : null}
    </Pressable>
  );
}

export function LightboxModal({ visible, onClose }: LightboxModalProps) {
  // Mount the keep-awake/content only while visible.
  return (
    <Modal
      visible={visible}
      animationType="fade"
      supportedOrientations={['portrait', 'landscape']}
      onRequestClose={onClose}>
      {visible ? <LightboxContent onClose={onClose} /> : null}
    </Modal>
  );
}

// The lightbox is intentionally NOT theme-driven — it's a physical light, so the
// panel is white and the controls are fixed dark-on-light for legibility on it.
const styles = StyleSheet.create({
  panel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: Spacing.lg,
  },
  controls: {
    width: '100%',
    maxWidth: 520,
    gap: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  hint: {
    color: 'rgba(0,0,0,0.6)',
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: FontSize.sm * 1.5,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  slider: {
    flex: 1,
    height: 40,
  },
  sliderLabel: {
    color: 'rgba(0,0,0,0.6)',
    fontSize: FontSize.xs,
    width: 38,
    textAlign: 'center',
  },
  closeButton: {
    alignSelf: 'center',
    backgroundColor: '#000000',
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.xl,
    borderRadius: Radius.full,
  },
  closeText: {
    color: '#FFFFFF',
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.2,
  },
});
