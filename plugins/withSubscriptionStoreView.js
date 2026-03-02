/**
 * Expo Config Plugin: SubscriptionStoreViewModule
 *
 * Injects the native iOS module for Apple's SubscriptionStoreView (iOS 17+)
 * into the Xcode project during prebuild. This ensures the native files survive
 * CNG (Continuous Native Generation) where the ios/ directory is regenerated.
 */

const {
  withXcodeProject,
  withDangerousMod,
  IOSConfig,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

// ── Swift source ──────────────────────────────────────────────────────────────

const SWIFT_SOURCE = `import Foundation
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
`;

// ── ObjC bridge ───────────────────────────────────────────────────────────────

const OBJC_SOURCE = `#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(SubscriptionStoreViewModule, NSObject)

RCT_EXTERN_METHOD(presentSubscriptionStoreWithGroupID:(NSString *)groupID
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(presentSubscriptionStore:(NSArray *)productIDs
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
`;

// ── Plugin ────────────────────────────────────────────────────────────────────

/**
 * Step 1: Write the native source files into the ios project directory.
 */
function withSubscriptionStoreViewFiles(config) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const projectRoot = config.modRequest.platformProjectRoot; // ios/
      const projectName = config.modRequest.projectName; // DeepHorizonSecurity
      const targetDir = path.join(projectRoot, projectName);

      // Ensure the target directory exists
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // Write Swift file
      const swiftPath = path.join(targetDir, "SubscriptionStoreViewModule.swift");
      fs.writeFileSync(swiftPath, SWIFT_SOURCE);
      console.log("[withSubscriptionStoreView] Wrote", swiftPath);

      // Write ObjC file
      const objcPath = path.join(targetDir, "SubscriptionStoreViewModule.m");
      fs.writeFileSync(objcPath, OBJC_SOURCE);
      console.log("[withSubscriptionStoreView] Wrote", objcPath);

      return config;
    },
  ]);
}

/**
 * Step 2: Add the files to the Xcode project so they get compiled.
 */
function withSubscriptionStoreViewXcodeProject(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const projectName = config.modRequest.projectName;

    const swiftFile = "SubscriptionStoreViewModule.swift";
    const objcFile = "SubscriptionStoreViewModule.m";

    // Get the main group (project target group)
    const mainGroup = project.getFirstProject().firstProject.mainGroup;

    // Find the app target group
    const appGroupKey = project.findPBXGroupKey({ name: projectName });

    // Check if files already exist to avoid duplicates
    const existingFiles = project.pbxFileReferenceSection();
    const swiftExists = Object.values(existingFiles).some(
      (f) => f && f.name === swiftFile
    );
    const objcExists = Object.values(existingFiles).some(
      (f) => f && f.name === objcFile
    );

    if (!swiftExists) {
      project.addSourceFile(
        `${projectName}/${swiftFile}`,
        { target: project.getFirstTarget().uuid },
        appGroupKey
      );
      console.log("[withSubscriptionStoreView] Added", swiftFile, "to Xcode project");
    }

    if (!objcExists) {
      project.addSourceFile(
        `${projectName}/${objcFile}`,
        { target: project.getFirstTarget().uuid },
        appGroupKey
      );
      console.log("[withSubscriptionStoreView] Added", objcFile, "to Xcode project");
    }

    return config;
  });
}

/**
 * Main plugin export.
 */
function withSubscriptionStoreView(config) {
  config = withSubscriptionStoreViewFiles(config);
  config = withSubscriptionStoreViewXcodeProject(config);
  return config;
}

module.exports = withSubscriptionStoreView;
