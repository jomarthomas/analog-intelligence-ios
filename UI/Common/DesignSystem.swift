//
//  DesignSystem.swift
//  AnalogIntelligence
//
//  Design system matching the mockup specifications
//  Dark theme with orange accents
//

import SwiftUI

/// Brand colors and design tokens
struct AnalogTheme {

    // MARK: - Colors

    /// Primary brand color - Orange accent
    static let primaryOrange = Color(red: 1.0, green: 0.6, blue: 0.2) // #FF9933

    /// Background colors
    static let backgroundDark = Color(red: 0.08, green: 0.08, blue: 0.12) // #141418
    static let backgroundCard = Color(red: 0.12, green: 0.12, blue: 0.16) // #1E1E28
    static let backgroundOverlay = Color.black.opacity(0.5)

    /// Text colors
    static let textPrimary = Color.white
    static let textSecondary = Color.white.opacity(0.7)
    static let textTertiary = Color.white.opacity(0.5)

    /// Pro badge color
    static let proBadge = primaryOrange

    /// Slider colors
    static let sliderTrack = primaryOrange
    static let sliderBackground = Color.white.opacity(0.2)

    // MARK: - Typography

    static func title() -> Font {
        .system(size: 20, weight: .semibold)
    }

    static func headline() -> Font {
        .system(size: 17, weight: .semibold)
    }

    static func body() -> Font {
        .system(size: 15, weight: .regular)
    }

    static func caption() -> Font {
        .system(size: 13, weight: .medium)
    }

    // MARK: - Spacing

    static let paddingSmall: CGFloat = 8
    static let paddingMedium: CGFloat = 16
    static let paddingLarge: CGFloat = 24

    // MARK: - Corner Radius

    static let cornerRadiusSmall: CGFloat = 8
    static let cornerRadiusMedium: CGFloat = 12
    static let cornerRadiusLarge: CGFloat = 16

    // MARK: - Shadows

    static let cardShadow: (color: Color, radius: CGFloat, x: CGFloat, y: CGFloat) = (
        color: Color.black.opacity(0.3),
        radius: 8,
        x: 0,
        y: 4
    )
}

// MARK: - View Modifiers

struct CardStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(AnalogTheme.backgroundCard)
            .cornerRadius(AnalogTheme.cornerRadiusMedium)
            .shadow(
                color: AnalogTheme.cardShadow.color,
                radius: AnalogTheme.cardShadow.radius,
                x: AnalogTheme.cardShadow.x,
                y: AnalogTheme.cardShadow.y
            )
    }
}

struct ProBadgeStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(AnalogTheme.caption())
            .foregroundColor(.black)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(AnalogTheme.proBadge)
            .cornerRadius(4)
    }
}

extension View {
    func cardStyle() -> some View {
        modifier(CardStyle())
    }

    func proBadge() -> some View {
        modifier(ProBadgeStyle())
    }
}
