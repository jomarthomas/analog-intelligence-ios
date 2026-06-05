/**
 * src/features/adjust/AIToggleRow.tsx
 *
 * A labelled Switch row for a Pro AI processing flag (aiColor / aiDustRemoval).
 *
 * The row itself is presentational; the parent wraps the AI section in a
 * <ProGate> so free users get the upgrade prompt and only Pro users can
 * actually toggle. A <ProBadge> is shown inline as an affordance.
 */

import { StyleSheet, Switch, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { FontSize, FontWeight, Palette, Spacing } from '@/constants/theme';
import { ProBadge } from '@/theme/pro-badge';

export type AIToggleRowProps = {
  label: string;
  /** Optional helper text under the label. */
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
};

export function AIToggleRow({
  label,
  description,
  value,
  onValueChange,
}: AIToggleRowProps) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      <View style={styles.textCol}>
        <View style={styles.labelRow}>
          <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
          <ProBadge size="sm" />
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
        trackColor={{ false: theme.backgroundSelected, true: theme.accent }}
        thumbColor={value ? theme.accentText : Palette.white}
        ios_backgroundColor={theme.backgroundSelected}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingVertical: Spacing.xs,
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
    fontWeight: FontWeight.medium,
  },
  description: {
    fontSize: FontSize.sm,
    lineHeight: FontSize.sm * 1.4,
  },
});
