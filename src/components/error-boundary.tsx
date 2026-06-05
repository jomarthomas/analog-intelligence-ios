/**
 * src/components/error-boundary.tsx
 *
 * Top-level React error boundary. Catches render/lifecycle errors anywhere in
 * the tree, reports them to telemetry, and shows a minimal black & white
 * fallback with a "Try again" reset instead of a blank screen or crash.
 *
 * (Error boundaries must be class components; the fallback reads the system
 * colour scheme directly since it can't use hooks.)
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Appearance, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';
import { captureException } from '@/lib/telemetry';

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    captureException(error, {
      source: 'ErrorBoundary',
      componentStack: info.componentStack ?? undefined,
    });
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error == null) return this.props.children;

    const scheme = Appearance.getColorScheme() === 'light' ? Colors.light : Colors.dark;

    return (
      <View style={[styles.root, { backgroundColor: scheme.background }]}>
        <Text style={[styles.title, { color: scheme.text }]}>Something went wrong</Text>
        <Text style={[styles.body, { color: scheme.textSecondary }]}>
          The app hit an unexpected error. Your scans are safe. Try again, and if it
          keeps happening, restart the app.
        </Text>
        {__DEV__ ? (
          <Text style={[styles.detail, { color: scheme.textTertiary }]} numberOfLines={6}>
            {error.message}
          </Text>
        ) : null}
        <Pressable
          onPress={this.reset}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: scheme.accent, opacity: pressed ? 0.8 : 1 },
          ]}>
          <Text style={[styles.buttonText, { color: scheme.accentText }]}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    letterSpacing: -0.3,
  },
  body: {
    fontSize: FontSize.md,
    textAlign: 'center',
    lineHeight: FontSize.md * 1.5,
  },
  detail: {
    fontSize: FontSize.xs,
    textAlign: 'center',
    fontFamily: 'monospace',
    marginTop: Spacing.xs,
  },
  button: {
    marginTop: Spacing.sm,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.xl,
    borderRadius: Radius.full,
  },
  buttonText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.2,
  },
});
