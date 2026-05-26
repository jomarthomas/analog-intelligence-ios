/**
 * ListRow — a single settings/list row with optional leading icon, label,
 * right accessory, and a hairline separator.
 *
 * Usage:
 *   <ListRow label="Export format" value="JPEG" onPress={…} showChevron />
 *   <ListRow label="Pro version" right={<ProBadge />} />
 */

import { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { FontSize, FontWeight, Spacing } from '@/constants/theme';

type ListRowProps = {
  label: string;
  value?: string;
  right?: ReactNode;
  left?: ReactNode;
  showChevron?: boolean;
  showSeparator?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
  destructive?: boolean;
};

export function ListRow({
  label,
  value,
  right,
  left,
  showChevron = false,
  showSeparator = true,
  onPress,
  style,
  destructive = false,
}: ListRowProps) {
  const theme = useTheme();

  const content = (
    <View style={[styles.row, style]}>
      {left && <View style={styles.leadingIcon}>{left}</View>}

      <Text
        style={[
          styles.label,
          { color: destructive ? '#FF453A' : theme.text },
        ]}
        numberOfLines={1}>
        {label}
      </Text>

      <View style={styles.trailing}>
        {value ? (
          <Text style={[styles.value, { color: theme.textSecondary }]} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
        {right}
        {showChevron && (
          <Text style={{ color: theme.textSecondary, fontSize: FontSize.lg }}>
            {Platform.OS === 'ios' ? '›' : '>'}
          </Text>
        )}
      </View>
    </View>
  );

  const separator = showSeparator ? (
    <View style={[styles.separator, { backgroundColor: theme.border }]} />
  ) : null;

  if (onPress) {
    return (
      <>
        <Pressable
          onPress={onPress}
          style={({ pressed }) => pressed && styles.pressed}>
          {content}
        </Pressable>
        {separator}
      </>
    );
  }

  return (
    <>
      {content}
      {separator}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
    minHeight: 44,
    gap: Spacing.sm,
  },
  leadingIcon: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: FontWeight.regular,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  value: {
    fontSize: FontSize.md,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.md,
  },
  pressed: {
    opacity: 0.6,
  },
});
