/**
 * Button — primary, secondary, and ghost variants.
 *
 * Usage:
 *   <Button onPress={…}>Scan</Button>
 *   <Button variant="secondary" onPress={…}>Cancel</Button>
 *   <Button variant="ghost" size="sm" onPress={…}>Skip</Button>
 *   <Button disabled>Processing…</Button>
 */

import { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { FontSize, FontWeight, Palette, Radius, Spacing } from '@/constants/theme';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = {
  onPress?: () => void;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  fullWidth?: boolean;
};

export function Button({
  onPress,
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  style,
  fullWidth = false,
}: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  const containerStyle = [
    styles.base,
    styles[`size_${size}`],
    variant === 'primary' && { backgroundColor: theme.accent },
    variant === 'secondary' && {
      backgroundColor: theme.backgroundElement,
      borderWidth: 1,
      borderColor: theme.border,
    },
    variant === 'ghost' && { backgroundColor: 'transparent' },
    variant === 'danger' && { backgroundColor: Palette.danger },
    fullWidth && styles.fullWidth,
    isDisabled && styles.disabled,
    style,
  ];

  const textColor =
    variant === 'primary'
      ? theme.accentText
      : variant === 'danger'
        ? Palette.white
        : theme.text;

  const fontSize =
    size === 'sm' ? FontSize.sm : size === 'lg' ? FontSize.xl : FontSize.md;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [containerStyle, pressed && styles.pressed]}>
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? theme.accentText : theme.accent}
        />
      ) : (
        <Text
          style={[
            styles.label,
            { color: textColor, fontSize, fontWeight: FontWeight.semibold },
          ]}>
          {children}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    gap: Spacing.sm,
  },
  size_sm: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.sm,
  },
  size_md: {
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.lg,
  },
  size_lg: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: Radius.lg,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.75,
  },
  label: {
    letterSpacing: 0.2,
  },
});
