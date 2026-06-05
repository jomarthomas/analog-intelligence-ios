/**
 * src/features/settings/SettingsToggleRow.tsx
 *
 * A labelled Switch row for boolean preferences, styled to match ListRow.
 * Optionally shows a ProBadge and can be locked (disabled) for non-Pro users.
 */

import { StyleSheet, Switch, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { FontSize, FontWeight, Palette, Spacing } from '@/constants/theme';
import { ProBadge } from '@/theme/pro-badge';

export type SettingsToggleRowProps = {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  /** Optional helper text below the label. */
  description?: string;
  /** Show an inline PRO badge. */
  pro?: boolean;
  /** Disable interaction (e.g. a Pro toggle for a free user). */
  disabled?: boolean;
  /** Hairline separator below the row. */
  showSeparator?: boolean;
};

export function SettingsToggleRow({
  label,
  value,
  onValueChange,
  description,
  pro = false,
  disabled = false,
  showSeparator = true,
}: SettingsToggleRowProps) {
  const theme = useTheme();

  return (
    <>
      <View style={[styles.row, disabled && styles.disabled]}>
        <View style={styles.textCol}>
          <View style={styles.labelRow}>
            <Text style={[styles.label, { color: theme.text }]} numberOfLines={1}>
              {label}
            </Text>
            {pro && <ProBadge size="sm" />}
          </View>
          {description != null && (
            <Text style={[styles.description, { color: theme.textSecondary }]}>
              {description}
            </Text>
          )}
        </View>
        <Switch
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          trackColor={{ false: theme.backgroundSelected, true: theme.accent }}
          thumbColor={value ? theme.accentText : Palette.white}
          ios_backgroundColor={theme.backgroundSelected}
        />
      </View>
      {showSeparator && (
        <View style={[styles.separator, { backgroundColor: theme.border }]} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    minHeight: 44,
    gap: Spacing.md,
  },
  disabled: {
    opacity: 0.5,
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  label: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.regular,
  },
  description: {
    fontSize: FontSize.sm,
    lineHeight: FontSize.sm * 1.4,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.md,
  },
});
