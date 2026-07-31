#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(BlindNavDetector, NSObject)

RCT_EXTERN_METHOD(detectFromFrame:(NSString *)framePath
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
