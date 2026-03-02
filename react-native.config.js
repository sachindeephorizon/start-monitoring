// Disable iOS autolinking for Razorpay to ensure the iOS binary contains
// NO external payment SDKs (App Store compliance: StoreKit only on iOS).
//
// Android builds can still use Razorpay.
module.exports = {
  dependencies: {
    'react-native-razorpay': {
      platforms: {
        ios: null,
      },
    },
  },
};

