//
//  AdManager.swift
//  AnalogIntelligence
//
//  Ad state and event types for advertisement management
//
//  NOTE: BannerAdView is now in BannerAdView.swift with full AdMob integration
//  NOTE: AdMob functionality is in AdMobManager.swift
//

import Foundation

/// Ad state
enum AdState: Equatable {
    case notLoaded
    case loading
    case loaded
    case failed(String)
    case hidden

    var canShowAd: Bool {
        self == .loaded
    }
}

/// Ad events
enum AdEvent {
    case clicked
    case closed
    case failed(String)
    case impression
}
