/**
 * Settings tab — app preferences and account management.
 *
 * Intended layout:
 *   - Pro upgrade banner (free users)
 *   - Sections: Export, Camera, Processing, About
 *   - Export format (JPEG / TIFF / DNG)
 *   - Default resolution
 *   - Camera controls defaults (ISO, WB)
 *   - Restore purchases
 *   - App version + build
 *
 * TODO(integration): Monetization agent — replace Pro upgrade banner stub
 *   with <ProUpgradeBanner> from src/monetization/. Wire up
 *   "Restore Purchases" row to RevenueCat via src/monetization/purchases.ts.
 *
 * TODO(integration): Storage agent — read/write user preferences via
 *   react-native-mmkv store from src/storage/prefs.ts.
 */

import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { Card } from '@/theme/card';
import { ListRow } from '@/theme/list-row';
import { ProBadge } from '@/theme/pro-badge';
import { SectionHeader } from '@/theme/section-header';
import { Screen } from '@/theme/screen';
import { FontSize, FontWeight, Palette, Radius, Spacing } from '@/constants/theme';

export default function SettingsScreen() {
  const theme = useTheme();

  return (
    <Screen edges={['top', 'left', 'right']} style={{ backgroundColor: theme.background }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        {/* Page title */}
        <View style={styles.headerRow}>
          <Text style={[styles.pageTitle, { color: theme.text }]}>Settings</Text>
        </View>

        {/* TODO(integration): Monetization — replace this stub with <ProUpgradeBanner /> */}
        <Card padding="md" elevated style={styles.proBanner}>
          <View style={styles.proBannerInner}>
            <View style={styles.proBannerText}>
              <Text style={[styles.proBannerTitle, { color: theme.text }]}>
                Unlock Analog Intelligence Pro
              </Text>
              <Text style={[styles.proBannerSub, { color: theme.textSecondary }]}>
                Full resolution · AI processing · Insights · No ads
              </Text>
            </View>
            {/* Amber accent strip */}
            <View style={[styles.proBannerAccent, { backgroundColor: theme.accent }]}>
              <Text style={styles.proBannerPrice}>$9.99</Text>
            </View>
          </View>
        </Card>

        {/* Export section */}
        <SectionHeader title="Export" />
        <Card padding="none">
          <ListRow
            label="Format"
            value="JPEG"
            showChevron
            onPress={() => {
              /* TODO(integration): open format picker */
            }}
          />
          <ListRow
            label="Resolution"
            value="Full"
            right={<ProBadge />}
            showChevron
            showSeparator={false}
            onPress={() => {
              /* TODO(integration): Pro gate + picker */
            }}
          />
        </Card>

        {/* Camera section */}
        <SectionHeader title="Camera" />
        <Card padding="none">
          <ListRow
            label="Default ISO"
            value="Auto"
            showChevron
            onPress={() => {
              /* TODO(integration): Camera agent settings */
            }}
          />
          <ListRow
            label="White Balance"
            value="Auto"
            showChevron
            showSeparator={false}
            onPress={() => {
              /* TODO(integration): Camera agent settings */
            }}
          />
        </Card>

        {/* Processing section */}
        <SectionHeader title="Processing" />
        <Card padding="none">
          <ListRow
            label="AI Color Reconstruction"
            right={<ProBadge />}
            showChevron
            onPress={() => {
              /* TODO(integration): Pipeline agent + Pro gate */
            }}
          />
          <ListRow
            label="AI Dust Removal"
            right={<ProBadge />}
            showChevron
            showSeparator={false}
            onPress={() => {
              /* TODO(integration): Pipeline agent + Pro gate */
            }}
          />
        </Card>

        {/* Account section */}
        <SectionHeader title="Account" />
        <Card padding="none">
          <ListRow
            label="Restore Purchases"
            showChevron
            onPress={() => {
              /* TODO(integration): Monetization agent — RevenueCat restorePurchases() */
            }}
          />
          <ListRow
            label="Privacy Policy"
            showChevron
            showSeparator={false}
            onPress={() => {
              /* TODO(integration): open external link */
            }}
          />
        </Card>

        {/* About */}
        <SectionHeader title="About" />
        <Card padding="none">
          <ListRow
            label="Version"
            value="1.0.0 (1)"
            showSeparator={false}
          />
        </Card>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.textSecondary }]}>
            Analog Intelligence™
          </Text>
          <Text style={[styles.footerText, { color: theme.textSecondary }]}>
            Wired up next — feature agents mount here
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  headerRow: {
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  pageTitle: {
    fontSize: FontSize.display,
    fontWeight: FontWeight.bold,
    letterSpacing: -0.5,
  },
  proBanner: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  proBannerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  proBannerText: {
    flex: 1,
    gap: Spacing.xs,
  },
  proBannerTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
  proBannerSub: {
    fontSize: FontSize.sm,
  },
  proBannerAccent: {
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  proBannerPrice: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Palette.black,
  },
  footer: {
    marginTop: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  footerText: {
    fontSize: FontSize.sm,
    fontStyle: 'italic',
  },
});
