/**
 * src/monetization/Paywall.tsx
 *
 * Full-screen paywall presented modally.  Fetches the current RevenueCat
 * offering, displays the package(s), and handles purchase + restore flows.
 *
 * Port of legacy ProUnlockView.swift / ProFeatureRow.swift — adapted for RN.
 *
 * Usage (via ProUpgradeBanner or direct):
 *   <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
 *     <Paywall onClose={() => setVisible(false)} />
 *   </Modal>
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';

import { useTheme } from '@/hooks/use-theme';
import {
  FontSize,
  FontWeight,
  Palette,
  Spacing,
} from '@/constants/theme';
import { Button } from '@/theme/button';
import { Card } from '@/theme/card';
import { ProBadge } from '@/theme/pro-badge';

import { useProStatus, fetchOffering } from './useProStatus';

// ---------------------------------------------------------------------------
// Feature list — mirrors legacy ProFeatureGate.proFeatures
// ---------------------------------------------------------------------------

type ProFeatureItem = {
  icon: string;
  title: string;
  description: string;
};

const PRO_FEATURES: ProFeatureItem[] = [
  {
    icon: '✦',
    title: 'Full Resolution Export',
    description: 'Export at maximum quality — no HD cap.',
  },
  {
    icon: '✦',
    title: 'No Watermark',
    description: 'Clean, watermark-free exports every time.',
  },
  {
    icon: '✦',
    title: 'Ad-Free Experience',
    description: 'Scan and edit without interruptions.',
  },
  {
    icon: '✦',
    title: 'Insights Tab',
    description: 'Exposure histograms and roll metrics.',
  },
  {
    icon: '✦',
    title: 'AI Color Reconstruction',
    description: 'Advanced color correction for accurate film reproduction.',
  },
  {
    icon: '✦',
    title: 'AI Dust & Scratch Removal',
    description: 'Automatically clean up scanned negatives.',
  },
  {
    icon: '✦',
    title: 'Contact Sheet Generator',
    description: 'Create professional contact sheets from your rolls.',
  },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type PaywallProps = {
  onClose: () => void;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Paywall({ onClose }: PaywallProps) {
  const theme = useTheme();
  const { isPro, isLoading, purchase, restore, error, clearError } = useProStatus();

  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [fetchingOffering, setFetchingOffering] = useState(true);

  // Auto-close when Pro is confirmed (e.g. after successful purchase).
  useEffect(() => {
    if (isPro) {
      const timer = setTimeout(onClose, 1400);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isPro, onClose]);

  // Fetch offering on mount.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const result = await fetchOffering();
      if (!cancelled) {
        setOffering(result);
        setFetchingOffering(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Show purchase errors as alerts.
  useEffect(() => {
    if (error) {
      Alert.alert('Purchase Error', error, [
        { text: 'OK', onPress: clearError },
      ]);
    }
  }, [error, clearError]);

  // ------------------------------------------------------------------
  // Handlers
  // ------------------------------------------------------------------

  const handlePurchase = useCallback(
    async (pkg: PurchasesPackage) => {
      await purchase(pkg);
    },
    [purchase],
  );

  const handleRestore = useCallback(async () => {
    const result = await restore();
    if (result.success && !result.isPro) {
      Alert.alert(
        'No Purchases Found',
        'No previous Pro purchase was found on this account.',
      );
    }
  }, [restore]);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  const isBusy = isLoading || fetchingOffering;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header bar */}
      <View style={[styles.headerBar, { borderBottomColor: theme.border }]}>
        <View style={styles.headerLeft} />
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Upgrade to Pro
        </Text>
        <Pressable
          onPress={onClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.closeButton}>
          <Text style={[styles.closeIcon, { color: theme.textSecondary }]}>Done</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={[styles.heroIcon, { color: theme.accent }]}>◆</Text>
          <ProBadge size="lg" />
          <Text style={[styles.heroTitle, { color: theme.text }]}>
            Analog Intelligence Pro
          </Text>
          <Text style={[styles.heroSubtitle, { color: theme.textSecondary }]}>
            Unlock the full power of professional film scanning.{'\n'}
            One-time purchase. No subscriptions.
          </Text>
        </View>

        {/* Features list */}
        <Card padding="lg" style={styles.featuresCard}>
          {PRO_FEATURES.map((feature) => (
            <View key={feature.title} style={styles.featureRow}>
              <Text style={[styles.featureIcon, { color: theme.accent }]}>{feature.icon}</Text>
              <View style={styles.featureText}>
                <Text
                  style={[
                    styles.featureTitle,
                    { color: theme.text, fontSize: FontSize.md },
                  ]}>
                  {feature.title}
                </Text>
                <Text
                  style={[
                    styles.featureDescription,
                    { color: theme.textSecondary, fontSize: FontSize.sm },
                  ]}>
                  {feature.description}
                </Text>
              </View>
            </View>
          ))}
        </Card>

        {/* Purchase section */}
        {isPro ? (
          <View style={styles.successSection}>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={[styles.successTitle, { color: Palette.success }]}>
              You&apos;re a Pro user!
            </Text>
            <Text style={[styles.successSubtitle, { color: theme.textSecondary }]}>
              Thank you for your support.
            </Text>
          </View>
        ) : (
          <View style={styles.purchaseSection}>
            {fetchingOffering ? (
              <ActivityIndicator color={theme.accent} size="large" />
            ) : offering !== null && offering.availablePackages.length > 0 ? (
              <>
                {offering.availablePackages.map((pkg) => (
                  <PackageButton
                    key={pkg.identifier}
                    pkg={pkg}
                    onPress={handlePurchase}
                    disabled={isBusy}
                  />
                ))}
              </>
            ) : (
              // RC not configured or network failure — show a generic CTA.
              <Button
                disabled
                variant="primary"
                size="lg"
                fullWidth>
                Upgrade — $9.99
              </Button>
            )}

            {/* Restore */}
            <Pressable
              onPress={handleRestore}
              disabled={isBusy}
              style={({ pressed }) => [styles.restoreButton, pressed && styles.restorePressed]}>
              <Text style={[styles.restoreText, { color: theme.textSecondary }]}>
                Restore Purchases
              </Text>
            </Pressable>

            <Text style={[styles.finePrint, { color: theme.textSecondary }]}>
              One-time purchase. Unlock once, own forever.{'\n'}
              By purchasing you agree to our Terms of Use.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// PackageButton sub-component
// ---------------------------------------------------------------------------

type PackageButtonProps = {
  pkg: PurchasesPackage;
  onPress: (pkg: PurchasesPackage) => Promise<void>;
  disabled: boolean;
};

function PackageButton({ pkg, onPress, disabled }: PackageButtonProps) {
  const [busy, setBusy] = useState(false);

  const handle = useCallback(async () => {
    setBusy(true);
    await onPress(pkg);
    setBusy(false);
  }, [pkg, onPress]);

  const label = pkg.product.priceString
    ? `Unlock Pro — ${pkg.product.priceString}`
    : 'Unlock Pro';

  return (
    <Button
      onPress={handle}
      loading={busy}
      disabled={disabled}
      variant="primary"
      size="lg"
      fullWidth>
      {label}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    width: 48,
  },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  closeButton: {
    width: 48,
    alignItems: 'flex-end',
  },
  closeIcon: {
    fontSize: FontSize.md,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.lg,
  },
  hero: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
  },
  heroIcon: {
    fontSize: 48,
    color: Palette.amber,
  },
  heroTitle: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: FontSize.sm * 1.6,
  },
  featuresCard: {
    gap: Spacing.md,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  featureIcon: {
    color: Palette.amber,
    fontSize: FontSize.md,
    marginTop: 2,
    width: 20,
    textAlign: 'center',
  },
  featureText: {
    flex: 1,
    gap: 2,
  },
  featureTitle: {
    fontWeight: FontWeight.semibold,
  },
  featureDescription: {
    lineHeight: FontSize.sm * 1.5,
  },
  purchaseSection: {
    gap: Spacing.md,
    alignItems: 'center',
  },
  successSection: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
  },
  successIcon: {
    fontSize: 48,
    color: Palette.success,
  },
  successTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
  },
  successSubtitle: {
    fontSize: FontSize.sm,
  },
  restoreButton: {
    paddingVertical: Spacing.xs,
  },
  restorePressed: {
    opacity: 0.6,
  },
  restoreText: {
    fontSize: FontSize.sm,
    textDecorationLine: 'underline',
  },
  finePrint: {
    fontSize: FontSize.xs,
    textAlign: 'center',
    lineHeight: FontSize.xs * 1.6,
    marginTop: Spacing.xs,
  },
});
