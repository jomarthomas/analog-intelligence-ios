/**
 * Settings tab — app preferences and account management.
 *
 * Wiring (capstone integration):
 *   - Pro section: <ProUpgradeBanner> (free) or an "active" state, plus a
 *     "Restore Purchases" row that calls useProStatus().restore().
 *   - Export: default format (cycles jpeg/heic/png/tiff) + "save to Photos
 *     after processing" toggle — persisted via setPreference (@/storage).
 *   - Camera: RAW capture / grid overlay / live histogram toggles.
 *   - Processing: auto orange-mask correction + Pro AI default toggles.
 *   - Storage: usage from getStorageStats(); About: app version.
 *
 * Preferences are MMKV-backed (synchronous). We mirror them into local state
 * on mount so toggles re-render immediately, and write through setPreference.
 */

import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';

import { useTheme } from '@/hooks/use-theme';
import { Card } from '@/theme/card';
import { ListRow } from '@/theme/list-row';
import { SectionHeader } from '@/theme/section-header';
import { Screen } from '@/theme/screen';
import { FontSize, FontWeight, Spacing } from '@/constants/theme';

import { ProUpgradeBanner, useProStatus } from '@/monetization';
import {
  getPreferences,
  getStorageStats,
  setPreference,
  type ExportFormat,
  type StorageStats,
  type UserPreferences,
} from '@/storage';
import { SettingsToggleRow } from '@/features/settings';
import { LightboxModal } from '@/components/lightbox-modal';
import { useDockStore } from '@/state/useDockStore';

const EXPORT_FORMATS: ExportFormat[] = ['jpeg', 'heic', 'png', 'tiff'];

function nextExportFormat(current: ExportFormat): ExportFormat {
  const idx = EXPORT_FORMATS.indexOf(current);
  return EXPORT_FORMATS[(idx + 1) % EXPORT_FORMATS.length];
}

export default function SettingsScreen() {
  const theme = useTheme();
  const { isPro, restore, isLoading } = useProStatus();

  // Mirror MMKV prefs in local state for instant re-render on toggle.
  const [prefs, setPrefs] = useState<UserPreferences>(() => getPreferences());
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [lightboxVisible, setLightboxVisible] = useState(false);

  // Dock store for the Developer → Simulate Dock row.
  const dockStatus = useDockStore((s) => s.status);
  const dockConnect = useDockStore((s) => s.connect);
  const dockDisconnect = useDockStore((s) => s.disconnect);
  const isDockConnected = dockStatus.state !== 'idle';

  // Refresh storage stats on mount (async; SQLite + file sizes).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const s = await getStorageStats();
        if (!cancelled) setStats(s);
      } catch {
        // Non-fatal — leave stats null (row shows a dash).
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Generic helper: write a boolean pref + update local mirror.
  // setPreference exposes per-key overloads; for the boolean keys they all
  // accept a boolean, so we view it through a boolean-key function type rather
  // than matching a single literal overload at this generic call site.
  const setBool = useCallback(
    (key: BoolPrefKey, value: boolean) => {
      // Write through to MMKV, then re-read the full snapshot so local state
      // reflects the persisted truth (avoids a computed-key spread over the
      // boolean-key union, which the checker rejects as a literal key).
      setBooleanPreference(key, value);
      setPrefs(getPreferences());
    },
    [],
  );

  const cycleExportFormat = useCallback(() => {
    const next = nextExportFormat(prefs.defaultExportFormat);
    setPreference('defaultExportFormat', next);
    setPrefs((p) => ({ ...p, defaultExportFormat: next }));
  }, [prefs.defaultExportFormat]);

  const handleRestore = useCallback(async () => {
    const result = await restore();
    if (result.success) {
      Alert.alert(
        result.isPro ? 'Purchases restored' : 'No purchases found',
        result.isPro
          ? 'Your Pro features are active again.'
          : 'No previous Pro purchase was found on this account.',
      );
    } else {
      Alert.alert('Restore failed', result.error);
    }
  }, [restore]);

  const handleSimulateDock = useCallback(async () => {
    if (isDockConnected) {
      try {
        await dockDisconnect();
      } catch {
        // Disconnect errors are non-fatal — mirror the UI toggle state anyway.
      }
    } else {
      try {
        await dockConnect({ simulation: true });
        Alert.alert(
          'Simulated dock connected',
          'The dock simulation is now active. Go to the Scan tab to use it.',
        );
      } catch (err) {
        Alert.alert(
          'Simulate dock failed',
          err instanceof Error ? err.message : 'Could not start dock simulation.',
        );
      }
    }
  }, [isDockConnected, dockConnect, dockDisconnect]);

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <Screen edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        {/* Title */}
        <View style={styles.headerRow}>
          <Text style={[styles.pageTitle, { color: theme.text }]}>Settings</Text>
        </View>

        {/* Pro section */}
        {isPro ? (
          <Card padding="md" elevated style={styles.proActiveCard}>
            <Text style={[styles.proActiveTitle, { color: theme.accent }]}>
              Analog Intelligence Pro
            </Text>
            <Text style={[styles.proActiveSub, { color: theme.textSecondary }]}>
              Full resolution · AI processing · Insights · No ads — all unlocked.
            </Text>
          </Card>
        ) : (
          <View style={styles.bannerWrap}>
            <ProUpgradeBanner dismissible={false} />
          </View>
        )}

        {/* Export section */}
        <SectionHeader title="Export" />
        <Card padding="none">
          <ListRow
            label="Format"
            value={prefs.defaultExportFormat.toUpperCase()}
            showChevron
            onPress={cycleExportFormat}
          />
          <SettingsToggleRow
            label="Save to Photos after processing"
            value={prefs.saveToPhotosAfterProcessing}
            onValueChange={(v) => setBool('saveToPhotosAfterProcessing', v)}
            showSeparator={false}
          />
        </Card>

        {/* Camera section */}
        <SectionHeader title="Camera" />
        <Card padding="none">
          <SettingsToggleRow
            label="Capture RAW (DNG)"
            description="Where the device supports it."
            value={prefs.enableRawCapture}
            onValueChange={(v) => setBool('enableRawCapture', v)}
          />
          <SettingsToggleRow
            label="Show frame guide"
            value={prefs.showGridOverlay}
            onValueChange={(v) => setBool('showGridOverlay', v)}
          />
          <SettingsToggleRow
            label="Live histogram"
            value={prefs.showHistogram}
            onValueChange={(v) => setBool('showHistogram', v)}
            showSeparator={false}
          />
        </Card>

        {/* Processing section */}
        <SectionHeader title="Processing" />
        <Card padding="none">
          <SettingsToggleRow
            label="Auto orange-mask correction"
            description="Remove the orange film base on colour negatives."
            value={prefs.autoApplyOrangeMaskCorrection}
            onValueChange={(v) => setBool('autoApplyOrangeMaskCorrection', v)}
          />
          <SettingsToggleRow
            label="AI Color Reconstruction"
            pro
            disabled={!isPro}
            value={prefs.enableAIColorReconstruction}
            onValueChange={(v) => setBool('enableAIColorReconstruction', v)}
          />
          <SettingsToggleRow
            label="AI Dust Removal"
            pro
            disabled={!isPro}
            value={prefs.enableAIDustRemoval}
            onValueChange={(v) => setBool('enableAIDustRemoval', v)}
            showSeparator={false}
          />
        </Card>

        {/* Account section */}
        <SectionHeader title="Account" />
        <Card padding="none">
          <ListRow
            label="Restore Purchases"
            value={isLoading ? 'Checking…' : undefined}
            showChevron
            onPress={() => void handleRestore()}
          />
          <ListRow
            label="Storage used"
            value={stats ? stats.formattedSize : '—'}
            showSeparator={false}
          />
        </Card>

        {/* About section */}
        <SectionHeader title="About" />
        <Card padding="none">
          <ListRow
            label="Scans"
            value={stats ? `${stats.totalImages} (${stats.processedImages} processed)` : '—'}
          />
          <ListRow label="Version" value={appVersion} showSeparator={false} />
        </Card>

        {/* Tools */}
        <SectionHeader title="Tools" />
        <Card padding="none">
          <ListRow
            label="Lightbox"
            value="Backlight"
            showChevron
            onPress={() => setLightboxVisible(true)}
            showSeparator={false}
          />
        </Card>

        {/* Developer section — always visible; docked state is togglable */}
        <SectionHeader title="Developer" />
        <Card padding="none">
          <SettingsToggleRow
            label="Simulate Dock"
            description={
              isDockConnected
                ? `Connected (${dockStatus.isSimulation ? 'sim' : 'real'}) · ${dockStatus.state}`
                : 'Activates the BLE dock simulation on the Scan tab.'
            }
            value={isDockConnected}
            onValueChange={() => void handleSimulateDock()}
            showSeparator={false}
          />
        </Card>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.textSecondary }]}>
            Analog Intelligence™
          </Text>
        </View>
      </ScrollView>

      <LightboxModal
        visible={lightboxVisible}
        onClose={() => setLightboxVisible(false)}
      />
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Boolean preference keys (compile-time constrained to UserPreferences bools)
// ---------------------------------------------------------------------------

type BoolPrefKey = {
  [K in keyof UserPreferences]: UserPreferences[K] extends boolean ? K : never;
}[keyof UserPreferences];

/**
 * A boolean-key view of setPreference. The exported setPreference is a set of
 * per-key overloads; every boolean key accepts a boolean, so this typed alias
 * lets the generic setBool helper call through without picking one literal
 * overload. No behavioural change — it forwards to the same implementation.
 */
const setBooleanPreference: (key: BoolPrefKey, value: boolean) => void =
  setPreference as (key: BoolPrefKey, value: boolean) => void;

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
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
  bannerWrap: {
    marginTop: Spacing.sm,
    borderRadius: 12,
    overflow: 'hidden',
  },
  proActiveCard: {
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  proActiveTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  proActiveSub: {
    fontSize: FontSize.sm,
    lineHeight: FontSize.sm * 1.4,
  },
  footer: {
    marginTop: Spacing.xl,
    alignItems: 'center',
  },
  footerText: {
    fontSize: FontSize.sm,
    fontStyle: 'italic',
  },
});
