#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(SubscriptionStoreViewModule, NSObject)

RCT_EXTERN_METHOD(presentSubscriptionStoreWithGroupID:(NSString *)groupID
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(presentSubscriptionStore:(NSArray *)productIDs
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
