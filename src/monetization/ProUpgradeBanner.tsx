/**
 * src/monetization/ProUpgradeBanner.tsx
 *
 * A dismissable strip (or compact inline button) that prompts free-tier users
 * to upgrade to Pro.  Renders null when the user is already Pro.
 *
 * Usage
 * ─────
 *   // Full banner — e.g. at the bottom of a screen:
 *   <ProUpgradeBanner />
 *
 *   // Compact button — e.g. inside ProGate overlay:
 *   <ProUpgradeBanner compact label="Upgrade to Pro" />
 *
 *   // With a custom onPress handler (opens paywall modal):
 *   <ProUpgradeBanner onPress={() => setPaywallVisible(true)} />
 */

import React, { useCallback, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import {
  FontSize,
  FontWeight,
  Palette,
  Radius,
  Spacing,
} from '@/constants/theme';
import { Button } from '@/theme/button';
import { ProBadge } from '@/theme/pro-badge';

import { useProStatus } from './useProStatus';
import { Paywall } from './Paywall';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type ProUpgradeBannerProps = {
  /** When true renders as a compact inline button rather than a full banner. */
  compact?: boolean;
  /** Override the CTA button label. Default: "Upgrade to Pro". */
  label?: string;
  /** Override the press handler (e.g. navigate to a custom settings screen). */
  onPress?: () => void;
  /** Allow the banner to be dismissed by the user (full-banner mode only). */
  dismissible?: boolean;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProUpgradeBanner({
  compact = false,
  label = 'Upgrade to Pro',
  onPress,
  dismissible = true,
}: ProUpgradeBannerProps) {
  const { isPro } = useProStatus();
  const theme = useTheme();
  const [dismissed, setDismissed] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);

  const handlePress = useCallback(() => {
    if (onPress) {
      onPress();
    } else {
      setPaywallVisible(true);
    }
  }, [onPress]);

  // Render nothing when the user is Pro or has dismissed the banner.
  if (isPro || dismissed) return null;

  // ── Compact variant ──────────────────────────────────────────────────────
  if (compact) {
    return (
      <>
        <Button onPress={handlePress} size="md" fullWidth>
          {label}
        </Button>

        <Modal
          visible={paywallVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setPaywallVisible(false)}>
          <Paywall onClose={() => setPaywallVisible(false)} />
        </Modal>
      </>
    );
  }

  // ── Full banner variant ──────────────────────────────────────────────────
  return (
    <>
      <View style={[styles.banner, { backgroundColor: theme.backgroundCard, borderColor: theme.border }]}>
        <View style={styles.left}>
          <ProBadge size="sm" />
          <Text
            style={[
              styles.bannerText,
              { color: theme.text, fontSize: FontSize.sm },
            ]}
            numberOfLines={1}>
            Unlock full resolution, no watermarks & more
          </Text>
        </View>

        <View style={styles.right}>
          <Pressable
            onPress={handlePress}
            style={({ pressed }) => [
              styles.ctaButton,
              pressed && styles.ctaButtonPressed,
            ]}>
            <Text style={styles.ctaText}>{label}</Text>
          </Pressable>

          {dismissible && (
            <Pressable
              onPress={() => setDismissed(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.dismissButton}>
              <Text style={[styles.dismissIcon, { color: theme.textSecondary }]}>
                ✕
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      <Modal
        visible={paywallVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPaywallVisible(false)}>
        <Paywall onClose={() => setPaywallVisible(false)} />
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    overflow: 'hidden',
  },
  bannerText: {
    flex: 1,
    fontWeight: FontWeight.medium,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexShrink: 0,
  },
  ctaButton: {
    backgroundColor: Palette.amber,
    paddingVertical: 5,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
  },
  ctaButtonPressed: {
    opacity: 0.8,
  },
  ctaText: {
    color: Palette.black,
    fontWeight: FontWeight.semibold,
    fontSize: FontSize.sm,
  },
  dismissButton: {
    padding: 2,
  },
  dismissIcon: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
});
