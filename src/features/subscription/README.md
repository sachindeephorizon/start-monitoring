# Subscriptions & Payments

Subscription and payment functionality using Razorpay. Subscription state is server-owned and iOS-compliant.

## Architecture

### Core Design Principle

> **The app never decides subscription validity.**
> **The server is the source of truth.**

### iOS Compliance

- ✅ Razorpay allowed for real-world safety services (not digital content)
- ✅ Subscription state is server-owned
- ✅ Payment verification happens server-side
- ✅ App only reads subscription status
- ✅ UI wording follows App Store guidelines

### Why Razorpay is Allowed

Apple allows external payments for:
- Security services
- Emergency services
- Physical services
- Human-provided services (bodyguards, agents)

DeepHorizon qualifies as a real-world safety service, so Razorpay is permitted without requiring Apple IAP.

### Payment Flow

```
User selects security plan
  ↓
Server creates Razorpay order
  ↓
App opens Razorpay checkout (SDK)
  ↓
User completes payment
  ↓
Razorpay returns payment response
  ↓
App sends payment response to server
  ↓
Server verifies Razorpay signature
  ↓
Server activates subscription in database
  ↓
App refreshes subscription state
  ↓
Features become available
```

## Files

- **`subscription.types.ts`** - Type definitions
- **`subscription.constants.ts`** - Plan details, pricing, features, UI labels
- **`subscription.service.ts`** - Subscription operations and payment processing
- **`subscription.hooks.ts`** - React hooks for subscription
- **`subscription.guard.tsx`** - Component for feature gating
- **`README.md`** - This documentation

## Usage

### Checking Subscription Status

```tsx
import { useSubscription } from '@/features/subscription';

function ProfileScreen() {
  const { subscription, hasActiveSubscription, loading } = useSubscription();

  if (loading) {
    return <Text>Loading...</Text>;
  }

  if (!hasActiveSubscription) {
    return <Text>No active subscription</Text>;
  }

  return (
    <View>
      <Text>Plan: {subscription?.plan_name}</Text>
      <Text>Status: {subscription?.status}</Text>
      <Text>Expires: {subscription?.end_date}</Text>
    </View>
  );
}
```

### Purchasing a Subscription

```tsx
import { useSubscription } from '@/features/subscription';
import { SubscriptionPlan } from '@/features/subscription';

function PlansScreen() {
  const { purchaseSubscription, loading } = useSubscription();

  const handlePurchase = async (plan: SubscriptionPlan) => {
    const result = await purchaseSubscription(plan);

    if (result.success) {
      alert('Safety service activated successfully!');
    } else {
      alert('Failed to activate service: ' + result.error);
    }
  };

  return (
    <Button
      title="Activate Safety Service"
      onPress={() => handlePurchase('individual_monthly')}
      disabled={loading}
    />
  );
}
```

### Using Subscription Guard

```tsx
import { SubscriptionGuard } from '@/features/subscription';

function TrackingScreen() {
  return (
    <SubscriptionGuard>
      <TrackingContent />
    </SubscriptionGuard>
  );
}
```

## Key Principles

### 1. Server-Owned State

Subscription state is managed entirely on the server:

- Database stores subscription records
- Server verifies payment signatures
- Server activates/deactivates subscriptions
- App only reads subscription status

### 2. Server-Side Payment Verification

Payment verification MUST happen server-side:

1. App receives payment response from Razorpay
2. App sends payment response to server
3. Server verifies Razorpay signature
4. Server activates subscription
5. Server returns subscription details

The app never trusts payment responses - only the server verifies them.

### 3. Feature Gating

Features are gated based on subscription status:

- Tracking sessions
- Video calls
- Check-ins
- Bodyguard booking
- Chat (optional)

Use `SubscriptionGuard` to gate features.

### 4. UI Wording (App Store Compliance)

❌ **Don't use:**
- "Buy subscription"
- "Monthly plan"
- "Digital service"
- "Purchase plan"

✅ **Use:**
- "Activate Safety Service"
- "Security Plan"
- "Emergency Protection Service"
- "Activate Now"
- "Select Security Plan"

Apple reviewers read copy, not just code.

## Subscription Plans

### Individual Plans

- **Monthly**: ₹149/month
- **Yearly**: ₹1,639/year (equivalent to ₹136.58/month)

### Family Plans

- **Monthly**: ₹649/month
- **Yearly**: ₹7,139/year (equivalent to ₹594.92/month)

### Plan Features (All Plans)

All plans include:
- Real-time location tracking
- Emergency response system
- Video and audio calls (5 video sessions/month)
- Scheduled check-ins
- Real-time chat with agents
- Bodyguard booking
- Emergency contacts management
- Activity history

## Database Schema

### `user_subscriptions` Table

- `id` - Subscription ID
- `user_id` - User ID (references mobile_users)
- `plan_id` - Plan ID (e.g., 'plan_individual_monthly')
- `plan_name` - Plan name
- `plan_type` - 'individual' or 'family'
- `billing_cycle` - 'monthly' or 'yearly'
- `price` - Subscription price
- `currency` - Currency code (INR)
- `status` - 'active', 'cancelled', 'expired', 'trial'
- `start_date` - Subscription start date
- `end_date` - Subscription end date
- `renewal_date` - Next renewal date
- `payment_id` - Razorpay payment ID
- `payment_method` - Payment method

## Server-Side Requirements

The backend MUST provide:

### 1. Create Razorpay Order Function

**Endpoint**: `create_razorpay_order`

**Input**:
```json
{
  "plan": "individual_monthly"
}
```

**Output**:
```json
{
  "orderId": "order_123",
  "amount": 149,
  "currency": "INR"
}
```

**Server Actions**:
1. Create Razorpay order
2. Store order details
3. Return order ID and amount

### 2. Verify Razorpay Payment Function

**Endpoint**: `verify_razorpay_payment`

**Input**:
```json
{
  "razorpay_payment_id": "pay_123",
  "razorpay_order_id": "order_123",
  "razorpay_signature": "signature_123",
  "plan": "individual_monthly"
}
```

**Output**:
```json
{
  "subscription": {
    "id": "sub_123",
    "plan_id": "plan_individual_monthly",
    "status": "active",
    ...
  }
}
```

**Server Actions**:
1. Verify Razorpay signature using secret key
2. If valid, create/update subscription in database
3. Return subscription details

## Razorpay Integration

### Configuration

Add Razorpay key to environment variables:

```env
EXPO_PUBLIC_RAZORPAY_KEY_ID=your_razorpay_key_id
```

### Payment Processing

The app uses `react-native-razorpay` SDK:

```ts
import RazorpayCheckout from 'react-native-razorpay';

const options = {
  description: 'DeepHorizon Safety Service',
  currency: 'INR',
  key: RAZORPAY_KEY_ID,
  amount: amount * 100, // Amount in paise
  name: 'DeepHorizon Security',
  order_id: orderId,
  theme: { color: '#000000' },
};

const response = await RazorpayCheckout.open(options);
```

## Testing Scenarios

Test ALL of these scenarios:

### 1. Payment Success
- ✅ User selects plan
- ✅ Payment order created
- ✅ Razorpay checkout opens
- ✅ Payment completes
- ✅ Server verifies payment
- ✅ Subscription activated
- ✅ Features become available

### 2. Payment Cancelled
- ✅ User starts payment
- ✅ User cancels in Razorpay
- ✅ Payment not processed
- ✅ Subscription not activated
- ✅ Error shown to user

### 3. App Killed Mid-Payment
- ✅ Payment order created
- ✅ User kills app
- ✅ User reopens app
- ✅ Subscription state recovered
- ✅ User can retry payment

### 4. Network Drop
- ✅ Payment completes
- ✅ Network drops during verification
- ✅ Payment not verified
- ✅ Subscription not activated
- ✅ Error shown to user

### 5. Expired Subscription
- ✅ Subscription expires
- ✅ Features become unavailable
- ✅ SubscriptionGuard shows message
- ✅ User can renew subscription

## Security Considerations

- Payment signatures verified server-side only
- Razorpay secret key never exposed to client
- Subscription state stored in database (server-owned)
- App never trusts client-side payment responses
- All payment operations require authentication

## iOS Safety

- Razorpay allowed for real-world services
- Server owns subscription state
- Payment verification server-side
- UI wording App Store compliant
- No client-side payment trust

## Common Issues

### Payment Not Verified

**Cause**: Server-side verification failing or network error.

**Solution**: Check server logs, ensure Razorpay secret key is configured correctly.

### Subscription Not Activated

**Cause**: Payment verification succeeded but subscription creation failed.

**Solution**: Check server logs, ensure database operations complete successfully.

### Features Not Gated

**Cause**: SubscriptionGuard not used or subscription state not refreshed.

**Solution**: Ensure SubscriptionGuard wraps protected features, refresh subscription after purchase.

