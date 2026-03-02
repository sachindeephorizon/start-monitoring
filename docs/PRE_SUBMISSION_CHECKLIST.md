# Pre-Submission Checklist - App Store Review

## ✅ Code Changes (COMPLETED)

- [x] Issue 4: Fixed camera permission button text ("Grant Permission" → "Continue")
- [x] Issue 1: Implemented StoreKit for iOS subscriptions
- [x] Updated SubscriptionPlansScreen to handle iOS purchases
- [x] All code changes are complete and ready

## 📋 Before Rebuilding - Action Items

### 1. Create Products in App Store Connect (REQUIRED)

**Time Required**: 15-30 minutes

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Select your app: **DeepHorizon Security**
3. Navigate to **Features** → **In-App Purchases**
4. Click **+** to create subscription group: **"DeepHorizon Security Subscriptions"**

5. Create 4 subscription products with **EXACT** product IDs:

   **Product 1: Individual Monthly**
   - Product ID: `com.deephorizon.security.individual.monthly`
   - Type: Auto-Renewable Subscription
   - Duration: 1 Month
   - Price: Set to match ₹149 INR (or equivalent in your currency)

   **Product 2: Individual Yearly**
   - Product ID: `com.deephorizon.security.individual.yearly`
   - Type: Auto-Renewable Subscription
   - Duration: 1 Year
   - Price: Set to match ₹1,639 INR

   **Product 3: Family Monthly**
   - Product ID: `com.deephorizon.security.family.monthly`
   - Type: Auto-Renewable Subscription
   - Duration: 1 Month
   - Price: Set to match ₹649 INR

   **Product 4: Family Yearly**
   - Product ID: `com.deephorizon.security.family.yearly`
   - Type: Auto-Renewable Subscription
   - Duration: 1 Year
   - Price: Set to match ₹7,139 INR

6. For each product:
   - Add description: "Personal safety tracking, emergency alerts, video monitoring sessions, and location sharing"
   - Set pricing for all territories (or use "Match My Price")
   - Save and submit for review

**⚠️ CRITICAL**: Product IDs must match EXACTLY (case-sensitive)

### 2. Update Age Rating (ALREADY DONE ✅)

- [x] Removed "In-App Controls" from Age Rating
- [x] Set "Age Assurance" to "None"

### 3. Create Server Endpoint for Receipt Verification (REQUIRED)

**Time Required**: 1-2 hours

You need to create a Supabase Edge Function or backend endpoint:

**Function Name**: `verify_ios_purchase`

**Location**: Create as Supabase Edge Function or add to your backend API

**Request Body**:
```json
{
  "receipt": "base64_receipt_string",
  "transactionId": "transaction_id",
  "productId": "com.deephorizon.security.individual.monthly",
  "planId": "plan_RIADHZ91GxVCUn",
  "plan": {
    "id": "plan_RIADHZ91GxVCUn",
    "name": "Monthly Individual Plan",
    "type": "individual",
    "billing_cycle": "monthly",
    "price": 149,
    "currency": "INR"
  }
}
```

**What the endpoint should do**:
1. Verify receipt with Apple's App Store Server API
2. Check transaction status
3. Create/update subscription in `user_subscriptions` table
4. Return subscription details

**Apple Documentation**:
- [App Store Server API](https://developer.apple.com/documentation/appstoreserverapi)
- [Receipt Validation](https://developer.apple.com/documentation/appstorereceipts)

**Quick Implementation Guide**:
```javascript
// Example structure (adapt to your backend)
async function verifyIOSPurchase(req) {
  const { receipt, transactionId, productId, planId, plan } = req.body;
  
  // 1. Verify with Apple
  const appleResponse = await verifyReceiptWithApple(receipt);
  
  // 2. Check if transaction is valid
  if (!appleResponse.valid) {
    return { success: false, error: 'Invalid receipt' };
  }
  
  // 3. Create/update subscription in database
  const subscription = await createSubscription({
    user_id: req.user.id,
    plan_id: planId,
    status: 'active',
    start_date: new Date(),
    end_date: calculateEndDate(plan.billing_cycle),
    // ... other fields
  });
  
  // 4. Return subscription
  return { success: true, subscription };
}
```

### 4. Test iOS Purchases (REQUIRED)

**Time Required**: 30 minutes

1. **Create Sandbox Test Account**:
   - App Store Connect → Users and Access → Sandbox Testers
   - Click **+** to create test account
   - Use a different email domain (e.g., test@example.com)

2. **Test on Device**:
   ```bash
   # Build and install on device
   cd Deephorizon-security
   npx expo run:ios
   ```
   
3. **Test Purchase Flow**:
   - Sign out of App Store on test device
   - Open app and go to subscription plans
   - Select a plan
   - When prompted, sign in with sandbox test account
   - Complete purchase
   - Verify subscription is created in database
   - Test restore purchases

### 5. Prepare App Store Review Response

**Time Required**: 10 minutes

Copy the responses from these files into App Store Connect:

1. **Issue 3 (Background Audio)**: Copy from `APP_STORE_RESPONSE_ISSUE_3.md`
2. **Issue 4 (Camera Permission)**: Use this response:

```
We have updated the camera permission request flow to comply with App Store guidelines:
1. Changed all "Grant Permission" button text to "Continue" as required
2. Ensured the system permission dialog always appears immediately when users tap "Continue"
3. Removed the ability to cancel or delay the permission request before the system dialog appears

The permission flow now works as follows:
- Users see an informational message explaining why camera access is needed
- Users tap "Continue" to proceed
- The system permission dialog appears immediately
- Users can then grant or deny permission through the system dialog

These changes are included in this submission.
```

3. **Issue 1 (In-App Purchase)**: Use this response:

```
We have implemented StoreKit for iOS subscriptions as required. The app now uses Apple's in-app purchase system exclusively for iOS subscription purchases, while maintaining our existing payment system for Android.

All subscription products have been created in App Store Connect and are ready for review. The app will route iOS users to StoreKit for purchases, ensuring full compliance with App Store guidelines.
```

## 🔨 Rebuild Steps

### Step 1: Install Dependencies

```bash
cd Deephorizon-security
npm install
```

### Step 2: Install iOS Pods

```bash
cd ios
pod install
cd ..
```

### Step 3: Build for Testing

```bash
# For local testing
npx expo run:ios

# OR for EAS build
eas build --platform ios --profile development
```

### Step 4: Test Everything

- [ ] Test iOS purchase flow with sandbox account
- [ ] Test Android purchase flow (should still work with Razorpay)
- [ ] Test camera permission flow (button says "Continue")
- [ ] Test background audio (start audio call, background app)
- [ ] Verify subscription status updates correctly

### Step 5: Build for Production

```bash
# Build production version
eas build --platform ios --profile production
```

### Step 6: Submit to App Store

1. Upload build to App Store Connect
2. Fill in App Review Information:
   - Add responses to Issues 1, 3, and 4
   - Provide test account credentials if needed
3. Submit for review

## 📝 App Store Connect Submission Notes

In the **App Review Information** section, add:

**Notes for Reviewer**:
```
This app provides real-world safety and security services. Subscriptions are for access to:
- Personal safety tracking
- Emergency response services
- Video monitoring with security agents
- Location sharing for safety

All iOS subscriptions use Apple's StoreKit. Test account credentials: [your sandbox account]

Background audio is used exclusively for active audio calls with security agents, allowing continuous communication during emergency situations. Audio stops immediately when calls end.

Camera permission requests have been updated to use "Continue" button text and ensure system dialog always appears.
```

## ⚠️ Critical Reminders

1. **Product IDs**: Must match EXACTLY with App Store Connect
2. **Server Endpoint**: Must be created and working before submission
3. **Test Purchases**: Must work with sandbox accounts
4. **Version Number**: Already updated to 1.0.11 (111)
5. **Age Rating**: Already fixed (you did this)

## ✅ Final Checklist Before Submission

- [ ] Products created in App Store Connect
- [ ] Server endpoint `verify_ios_purchase` created and tested
- [ ] iOS purchases tested with sandbox account
- [ ] Android purchases still work (Razorpay)
- [ ] Camera permission button says "Continue"
- [ ] Background audio works during calls
- [ ] Age rating updated (no In-App Controls)
- [ ] App rebuilt with latest changes
- [ ] App Review responses prepared
- [ ] Test account credentials ready

## 🚀 Ready to Submit?

Once all items above are complete, you're ready to:
1. Build production version
2. Upload to App Store Connect
3. Add review responses
4. Submit for review

---

**Estimated Total Time**: 2-3 hours (mostly server endpoint + testing)

**Questions?** Refer to:
- `APP_STORE_CONNECT_SETUP.md` - Detailed product setup guide
- `IOS_PURCHASE_IMPLEMENTATION.md` - Technical implementation details
- `APP_STORE_RESPONSE_ISSUE_3.md` - Background audio response
