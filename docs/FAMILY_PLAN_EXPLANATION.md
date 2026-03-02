# How Family Plans Work - Complete Explanation

## Overview

Your app **already has family plan logic implemented**! Here's how it works:

## How It Works

### 1. When Someone Purchases a Family Plan

**Flow:**
1. User purchases Family Plan subscription (via iOS StoreKit or Razorpay)
2. Server creates subscription record in `user_subscriptions` table with:
   - `plan_id`: Family plan ID (e.g., `plan_RIADmXQMERsApy`)
   - `user_id`: The purchaser's user ID
   - `status`: 'active'
   - `start_date` and `end_date`

### 2. Adding Family Members

**The purchaser can add family members:**

1. **In the App:**
   - Go to **Family** screen (accessible when user has family plan)
   - Tap "Add Family Member"
   - Enter family member's phone number, name, and email
   - Tap "Add"

2. **What Happens:**
   - App calls `SubscriptionService.addFamilyMember(phone, name, email)`
   - Server creates record in `family_members` table with:
     - `subscription_id`: Links to the family subscription
     - `phone`: Family member's phone number
     - `name`: Family member's name
     - `email`: Family member's email
     - `is_active`: true

### 3. When Family Member Signs Up

**Here's the key part - how family members get access:**

1. **Family member downloads app and signs up:**
   - They create account with their phone number
   - Phone number is stored in `mobile_users` table

2. **App checks for family access:**
   - When app checks subscription access, it calls `checkFamilyAccess(phone)`
   - This function:
     - Looks up phone number in `family_members` table
     - Checks if they're linked to an active family subscription
     - Returns `hasAccess: true` if found

3. **Access granted automatically:**
   - Family member gets full access without purchasing
   - They can use all features
   - No subscription purchase needed

## Database Structure

### `user_subscriptions` Table
```sql
- id
- user_id (purchaser's user ID)
- plan_id (e.g., 'plan_RIADmXQMERsApy' for family monthly)
- status ('active')
- start_date
- end_date
```

### `family_members` Table
```sql
- id
- subscription_id (links to user_subscriptions.id)
- phone (family member's phone number)
- name
- email
- is_active (true/false)
```

## Code Flow

### When Checking Access

**File**: `src/services/subscription.service.ts`

```typescript
// 1. Check if user has direct subscription
const { subscription } = await getUserSubscription();

if (!subscription) {
  // 2. Check if user is a family member (by phone number)
  const profile = await AuthService.getCurrentUser();
  if (profile?.phone) {
    const { hasAccess: familyAccess } = await checkFamilyAccess(profile.phone);
    if (familyAccess) {
      return { hasAccess: true }; // ✅ Family member gets access!
    }
  }
  
  // 3. Otherwise check trial
  const { isTrialActive } = await getTrialStatus();
  return { hasAccess: isTrialActive };
}
```

### `checkFamilyAccess` Function

**What it does:**
1. Takes phone number as input
2. Looks up phone in `family_members` table
3. Checks if linked subscription is active
4. Returns `hasAccess: true` if found

```typescript
static async checkFamilyAccess(phone: string) {
  // Find family member by phone
  const { data: member } = await supabase
    .from('family_members')
    .select('subscription_id')
    .eq('phone', phone)
    .eq('is_active', true)
    .single();
  
  if (!member) {
    return { hasAccess: false };
  }
  
  // Check if subscription is active
  const { data: subscription } = await supabase
    .from('user_subscriptions')
    .select('*')
    .eq('id', member.subscription_id)
    .eq('status', 'active')
    .single();
  
  if (subscription && new Date(subscription.end_date) > new Date()) {
    return { hasAccess: true, member }; // ✅ Access granted!
  }
  
  return { hasAccess: false };
}
```

## Complete User Journey

### Scenario: Family of 3

**Step 1: Parent Purchases Family Plan**
- Parent downloads app
- Signs up with phone: +1234567890
- Purchases "Family Monthly Plan" (₹649)
- Subscription created: `user_subscriptions` table

**Step 2: Parent Adds Family Members**
- Parent opens **Family** screen
- Adds child 1: Phone +1234567891, Name "Child 1"
- Adds child 2: Phone +1234567892, Name "Child 2"
- Records created in `family_members` table

**Step 3: Child 1 Signs Up**
- Child 1 downloads app
- Signs up with phone: +1234567891
- App checks: `checkFamilyAccess('+1234567891')`
- ✅ Found in `family_members` table
- ✅ Linked subscription is active
- **Access granted automatically!** No purchase needed.

**Step 4: Child 2 Signs Up**
- Same process as Child 1
- Gets access automatically

## Important Points

### ✅ What Works Automatically

1. **Family members get access** when they sign up (if phone matches)
2. **No purchase needed** for family members
3. **Access is checked** every time app checks subscription
4. **Works with iOS StoreKit** - when parent purchases via StoreKit, family members still get access

### ⚠️ Requirements

1. **Phone number must match exactly**:
   - Phone in `family_members` table must match phone used during signup
   - Format matters (e.g., +1234567890 vs 1234567890)

2. **Subscription must be active**:
   - Parent's subscription must be active
   - End date must be in the future

3. **Family member must be added first**:
   - Parent must add family member before they sign up
   - OR family member signs up first, then parent adds them (will work on next access check)

### 🔄 Access Check Flow

Every time the app checks subscription access:

1. ✅ Check direct subscription (user's own subscription)
2. ✅ Check family membership (by phone number)
3. ✅ Check trial status
4. ✅ Grant access if any check passes

## iOS StoreKit Integration

**Good news:** The family plan logic works the same with iOS StoreKit!

**When parent purchases via StoreKit:**
1. Receipt is verified server-side
2. Server creates subscription in `user_subscriptions` table
3. Parent can add family members (same as before)
4. Family members get access (same as before)

**No changes needed** - the family plan logic is independent of payment method!

## Summary

**Your question:** "How will family members use the app without buying subscription?"

**Answer:** 
- ✅ Family members are added to `family_members` table by the purchaser
- ✅ When family member signs up, app checks their phone number
- ✅ If phone matches a family member record with active subscription → **Access granted!**
- ✅ No purchase needed for family members
- ✅ Works automatically with existing code

**The system is already built and working!** You just need to:
1. Create the subscription products in App Store Connect
2. Ensure your server endpoint creates subscriptions correctly
3. Test the family member flow

---

## Testing Family Plan Flow

1. **Parent purchases family plan** (via iOS StoreKit or Razorpay)
2. **Parent adds family member** (Family screen → Add Member)
3. **Family member signs up** with same phone number
4. **Verify access** - family member should have full access

That's it! The logic is already implemented. 🎉
