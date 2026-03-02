import Foundation
import React
import StoreKit
import SwiftUI

@objc(SubscriptionStoreViewModule)
class SubscriptionStoreViewModule: NSObject {

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return true
  }

  // MARK: - Present by Subscription Group ID (preferred)

  @objc
  func presentSubscriptionStoreWithGroupID(
    _ groupID: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    if #available(iOS 17.0, *) {
      DispatchQueue.main.async {
        guard let rootVC = Self.topViewController() else {
          reject("NO_ROOT_VC", "No root view controller found", nil)
          return
        }

        let view = SubscriptionStoreView(groupID: groupID)
          .subscriptionStoreControlStyle(.prominentPicker)

        let hostingController = UIHostingController(rootView: view)
        hostingController.modalPresentationStyle = .pageSheet

        rootVC.present(hostingController, animated: true) {
          resolve(nil)
        }
      }
    } else {
      reject("UNSUPPORTED", "SubscriptionStoreView requires iOS 17.0+", nil)
    }
  }

  // MARK: - Present by Product IDs

  @objc
  func presentSubscriptionStore(
    _ productIDs: [String],
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    if #available(iOS 17.0, *) {
      DispatchQueue.main.async {
        guard let rootVC = Self.topViewController() else {
          reject("NO_ROOT_VC", "No root view controller found", nil)
          return
        }

        let view = SubscriptionStoreView(productIDs: productIDs.map { Product.ID($0) })
          .subscriptionStoreControlStyle(.prominentPicker)

        let hostingController = UIHostingController(rootView: view)
        hostingController.modalPresentationStyle = .pageSheet

        rootVC.present(hostingController, animated: true) {
          resolve(nil)
        }
      }
    } else {
      reject("UNSUPPORTED", "SubscriptionStoreView requires iOS 17.0+", nil)
    }
  }

  // MARK: - Helpers

  /// Walk the VC hierarchy to find the topmost presented controller.
  private static func topViewController() -> UIViewController? {
    guard let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first(where: { $0.activationState == .foregroundActive }),
          var vc = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController
    else { return nil }

    while let presented = vc.presentedViewController {
      vc = presented
    }
    return vc
  }
}
