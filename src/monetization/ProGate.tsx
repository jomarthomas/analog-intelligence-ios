/**
 * src/monetization/ProGate.tsx
 *
 * Wraps Pro-only content.  Renders children when the user has Pro access;
 * shows a compact upgrade prompt otherwise.
 *
 * Usage
 * ─────
 *   // Gate entire feature sections:
 *   <ProGate>
 *     <InsightsChart />
 *   </ProGate>
 *
 *   // Custom fallback:
 *   <ProGate fallback={<MyCustomPrompt />}>
 *     <AIPanel />
 *   </ProGate>
 *
 *   // Suppress the prompt (just hide the content):
 *   <ProGate hiddenWhenLocked>
 *     <FullResExportOption />
 *   </ProGate>
 */

import React, { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { FontSize, FontWeight, Palette, Radius, Spacing } from '@/constants/theme';
import { ProBadge } from '@/theme/pro-badge';
import { Button } from '@/theme/button';

import { useProStatus } from './useProStatus';
import { ProUpgradeBanner } from './ProUpgradeBanner';

// Button is used indirectly via ProUpgradeBanner; the import ensures
// it is always bundled with this component when ProGate is used alone.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _ensureButtonBundled = Button;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type ProGateProps = {
  /** Content to render when the user has Pro access. */
  children: ReactNode;
  /**
   * Custom fallback rendered when the user is NOT Pro.
   * When omitted a default upgrade prompt is shown.
   */
  fallback?: ReactNode;
  /**
   * When true, render nothing (instead of the upgrade prompt) for free users.
   * Useful for hiding UI elements that shouldn't attract attention.
   */
  hiddenWhenLocked?: boolean;
  /**
   * Label shown on the default upgrade prompt button.
   * Defaults to "Upgrade to Pro".
   */
  upgradeLabel?: string;
  /**
   * Optional feature label used to contextualise the lock overlay.
   * E.g. "AI Color Reconstruction"
   */
  featureName?: string;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProGate({
  children,
  fallback,
  hiddenWhenLocked = false,
  upgradeLabel = 'Upgrade to Pro',
  featureName,
}: ProGateProps) {
  const { isPro, isLoading } = useProStatus();
  const theme = useTheme();

  // While we're checking RC (< 1 s in practice), show nothing to avoid flicker.
  if (isLoading) {
    return null;
  }

  if (isPro) {
    return <>{children}</>;
  }

  if (hiddenWhenLocked) {
    return null;
  }

  if (fallback !== undefined) {
    return <>{fallback}</>;
  }

  // ── Default lock overlay ─────────────────────────────────────────────────
  return (
    <View style={[styles.container, { borderColor: theme.border }]}>
      {/* Blurred / dimmed preview of children */}
      <View style={styles.contentWrapper} pointerEvents="none">
        {children}
      </View>

      {/* Lock overlay */}
      <View style={styles.overlay}>
        <View
          style={[
            styles.card,
            { backgroundColor: theme.backgroundCard },
          ]}>
          <ProBadge size="lg" />

          {featureName !== undefined && (
            <Text
              style={[
                styles.featureName,
                { color: theme.text, fontSize: FontSize.md },
              ]}>
              {featureName}
            </Text>
          )}

          <Text
            style={[
              styles.subtitle,
              { color: theme.textSecondary, fontSize: FontSize.sm },
            ]}>
            Unlock {featureName ?? 'this feature'} with Analog Intelligence Pro
          </Text>

          <ProUpgradeBanner compact label={upgradeLabel} />
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  contentWrapper: {
    opacity: 0.15,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    padding: Spacing.md,
  },
  card: {
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
    maxWidth: 320,
    width: '100%',
  },
  featureName: {
    fontWeight: FontWeight.semibold,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  subtitle: {
    textAlign: 'center',
    lineHeight: FontSize.sm * 1.5,
    marginBottom: Spacing.xs,
  },
});
