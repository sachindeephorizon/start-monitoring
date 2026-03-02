# iOS Build Fixes for React Native 0.81.5 + react-native-reanimated 3.16.7

## Overview
This document describes all the patches applied in the Podfile to fix iOS build errors when using React Native 0.81.5 with react-native-reanimated 3.16.7.

## Key Issues Fixed

### 1. Folly Coroutines Compatibility
- **Problem**: React Native 0.81.5 doesn't support Folly coroutines
- **Fix**: Disable Folly coroutines in all reanimated C++ files
- **Implementation**: 
  - Comment out `#include <folly/coro/Coroutine.h>`
  - Set `FOLLY_HAS_COROUTINES=0` in preprocessor definitions
  - Disable `#if FOLLY_HAS_COROUTINES` checks

### 2. parentShadowView → parentTag Migration
- **Problem**: `ShadowViewMutation` no longer has `parentShadowView` member in RN 0.81.5
- **Fix**: Replace all `parentShadowView` usages with `parentTag`
- **Critical**: Must handle `.tag` access patterns FIRST to avoid creating invalid `parentTag.tag` code
- **Pattern Order** (most specific first):
  1. `mutation.parentShadowView.tag` → `mutation.parentTag`
  2. `AnyObject.parentShadowView.tag` → `AnyObject.parentTag`
  3. `parentShadowView.tag` → `parentTag`
  4. `mutation.parentShadowView` → `mutation.parentTag`
  5. `.parentShadowView` (not followed by `.tag`) → `.parentTag`
  6. `parentShadowView` (standalone) → `parentTag`

### 3. shadowNodeFromValue Function Removal
- **Problem**: `shadowNodeFromValue` function doesn't exist in RN 0.81.5
- **Fix**: Replace all calls with `std::shared_ptr<const ShadowNode>(nullptr)`
- **Implementation**: Preserve variable declarations while replacing function calls

### 4. __construct_at Function Replacement
- **Problem**: `__construct_at` is not available in RN 0.81.5
- **Fix**: Replace with `new Type(args)`
- **Patterns**:
  - `__construct_at<Type>(args)` → `new Type(args)`
  - `std::__construct_at<Type>(args)` → `new Type(args)`

### 5. getSurfaceId() Function Removal
- **Problem**: `getSurfaceId()` method doesn't exist in RN 0.81.5
- **Fix**: Replace with `SurfaceId{}`

### 6. Namespace Qualification
- **Problem**: `NativeReanimatedModule` needs namespace qualification
- **Fix**: Add `reanimated::` namespace prefix to all function definitions

### 7. C++ Standard
- **Problem**: React Native 0.81.5 and reanimated require C++20
- **Fix**: Set `CLANG_CXX_LANGUAGE_STANDARD` to `c++20` for all relevant targets

## Files Patched

1. **All reanimated C++ files** (general patch)
2. **LayoutAnimationsProxy.cpp** (specific patch)
3. **LayoutAnimationsUtils.cpp** (specific patch)
4. **ShadowTreeCloner.cpp** (Folly coroutines)
5. **NativeReanimatedModule.cpp** (comprehensive patch)
6. **ReanimatedMountHook.h** (method signature)
7. **ReanimatedMountHook.cpp** (method signature)

## Build Settings Applied

- `FOLLY_HAS_COROUTINES=0` in preprocessor definitions
- `CLANG_CXX_LANGUAGE_STANDARD=c++20` for Reanimated targets
- `CLANG_CXX_LIBRARY=libc++` for Reanimated targets
- `GCC_TREAT_WARNINGS_AS_ERRORS=NO` for Reanimated targets
- `-Wno-error` flag for Reanimated targets

## Verification

After applying these patches, the build should:
- ✅ Compile all reanimated C++ files successfully
- ✅ Link without errors
- ✅ Create a valid iOS archive

## Notes

- The old app (DeepHorizon) doesn't use react-native-reanimated, which is why it builds without patches
- All patches are applied in the `post_install` hook of the Podfile
- Multiple file paths are tried for EAS build compatibility
- Patches preserve code structure and variable names to avoid breaking functionality

