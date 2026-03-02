# App Store Connect Setup Guide

## Setting Up In-App Purchase Products

To enable iOS subscriptions, you need to create subscription products in App Store Connect.

### Step 1: Access App Store Connect

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Sign in with your Apple Developer account
3. Select your app: **DeepHorizon Security**

### Step 2: Create Subscription Group

1. Navigate to **Features** → **In-App Purchases**
2. Click **+** to create a new subscription group
3. Name it: **DeepHorizon Security Subscriptions**
4. Click **Create**

### Step 3: Create Subscription Products

Create 4 subscription products matching these exact product IDs:

#### 1. Individual Monthly Plan
- **Product ID**: `com.deephorizon.security.individual.monthly`
- **Type**: Auto-Renewable Subscription
- **Subscription Group**: DeepHorizon Security Subscriptions
- **Reference Name**: Individual Monthly Plan
- **Duration**: 1 Month
- **Price**: Set according to your pricing (e.g., $1.99 USD equivalent to ₹149 INR)
- **Localization**: Add description in English and other languages as needed

#### 2. Individual Yearly Plan
- **Product ID**: `com.deephorizon.security.individual.yearly`
- **Type**: Auto-Renewable Subscription
- **Subscription Group**: DeepHorizon Security Subscriptions
- **Reference Name**: Individual Yearly Plan
- **Duration**: 1 Year
- **Price**: Set according to your pricing (e.g., $19.99 USD equivalent to ₹1,639 INR)
- **Localization**: Add description in English and other languages as needed

#### 3. Family Monthly Plan
- **Product ID**: `com.deephorizon.security.family.monthly`
- **Type**: Auto-Renewable Subscription
- **Subscription Group**: DeepHorizon Security Subscriptions
- **Reference Name**: Family Monthly Plan
- **Duration**: 1 Month
- **Price**: Set according to your pricing (e.g., $7.99 USD equivalent to ₹649 INR)
- **Localization**: Add description in English and other languages as needed

#### 4. Family Yearly Plan
- **Product ID**: `com.deephorizon.security.family.yearly`
- **Type**: Auto-Renewable Subscription
- **Subscription Group**: DeepHorizon Security Subscriptions
- **Reference Name**: Family Yearly Plan
- **Duration**: 1 Year
- **Price**: Set according to your pricing (e.g., $85.99 USD equivalent to ₹7,139 INR)
- **Localization**: Add description in English and other languages as needed

### Step 4: Configure Subscription Details

For each product:

1. **Subscription Information**:
   - Add clear description of what the subscription includes
   - Example: "Personal safety tracking, emergency alerts, video monitoring sessions, and location sharing"

2. **Subscription Pricing**:
   - Set prices for all territories (or use "Match My Price" for automatic conversion)
   - Ensure prices match your Razorpay pricing for consistency

3. **Review Information**:
   - Add screenshots if required
   - Add review notes explaining the subscription

4. **App Store Review**:
   - Submit for review (can be done with app submission)

### Step 5: Server-Side Receipt Verification

You need to create a server endpoint to verify iOS purchase receipts:

**Endpoint**: `verify_ios_purchase` (Supabase Edge Function)

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

**Server Implementation**:
1. Verify receipt with Apple's App Store Server API
2. Check transaction status
3. Create/update subscription in database
4. Return subscription details

**Apple Documentation**:
- [App Store Server API](https://developer.apple.com/documentation/appstoreserverapi)
- [Receipt Validation](https://developer.apple.com/documentation/appstorereceipts)

### Step 6: Testing

#### Sandbox Testing

1. Create sandbox test accounts in App Store Connect:
   - **Users and Access** → **Sandbox Testers** → **+** button
   - Create test accounts (use different email domains)

2. Test on device:
   - Sign out of App Store on test device
   - Build and install app
   - When prompted, sign in with sandbox test account
   - Test purchase flow

#### Test Product IDs

For testing, you can use the same product IDs. Apple will automatically use sandbox products when:
- App is in development/test mode
- User is signed in with sandbox account
- App is not yet approved for production

### Step 7: Update App Submission

When submitting your app:

1. **App Store Connect**:
   - Ensure all subscription products are submitted for review
   - Add subscription information in App Review Notes

2. **App Review Notes**:
   - Explain that subscriptions are for real-world safety services
   - Provide test account credentials if needed
   - Explain the subscription features

### Important Notes

⚠️ **Product IDs must match exactly** - The product IDs in `ios-purchase.service.ts` must match exactly with what you create in App Store Connect.

⚠️ **Pricing** - Set prices in App Store Connect. Apple handles currency conversion automatically, but you can set specific prices per territory.

⚠️ **Server Verification Required** - Always verify receipts server-side. Never trust client-side purchase data.

⚠️ **Subscription Management** - Users can manage subscriptions in iOS Settings → App Store → Subscriptions. Your app should handle subscription status changes.

### Troubleshooting

**Issue**: Products not found
- **Solution**: Ensure product IDs match exactly (case-sensitive)
- **Solution**: Wait a few minutes after creating products in App Store Connect
- **Solution**: Ensure app is using correct bundle ID

**Issue**: Sandbox purchases not working
- **Solution**: Sign out of App Store on test device
- **Solution**: Use sandbox test account
- **Solution**: Check that products are in "Ready to Submit" status

**Issue**: Receipt verification failing
- **Solution**: Check server logs
- **Solution**: Verify App Store Server API credentials
- **Solution**: Ensure receipt format is correct (base64)

### Next Steps

1. ✅ Create subscription products in App Store Connect
2. ✅ Implement server-side receipt verification endpoint
3. ✅ Test with sandbox accounts
4. ✅ Submit app with subscription products for review

---

**Questions?** Refer to:
- [Apple In-App Purchase Documentation](https://developer.apple.com/in-app-purchase/)
- [App Store Review Guidelines - Subscriptions](https://developer.apple.com/app-store/review/guidelines/#subscriptions)
