# Supabase Edge Function Setup Guide

## Creating the `verify_ios_purchase` Function

### Step 1: Install Supabase CLI

```bash
# Install Supabase CLI (if not already installed)
npm install -g supabase

# Or using Homebrew (macOS)
brew install supabase/tap/supabase
```

### Step 2: Login to Supabase

```bash
supabase login
```

This will open a browser for authentication.

### Step 3: Link to Your Project

```bash
cd Deephorizon-security
supabase link --project-ref YOUR_PROJECT_REF
```

**To find your project ref:**
- Go to Supabase Dashboard → Your Project → Settings → API
- The "Reference ID" is your project ref

### Step 4: Create the Function

The function has already been created in:
```
supabase/functions/verify_ios_purchase/index.ts
```

### Step 5: Set Environment Variables (Secrets)

You need to set the Apple Shared Secret:

```bash
# Set Apple Shared Secret
supabase secrets set APPLE_SHARED_SECRET=your_apple_shared_secret_here
```

**To get your Apple Shared Secret:**
1. Go to App Store Connect
2. Navigate to: **Users and Access** → **Keys** → **In-App Purchase**
3. If you don't have a key, click **"Generate"** to create one
4. Copy the **Shared Secret** (starts with something like `a1b2c3d4...`)

**⚠️ Important:** Keep this secret secure! Never commit it to git.

### Step 6: Deploy the Function

```bash
# Deploy the function
supabase functions deploy verify_ios_purchase
```

### Step 7: Test the Function

You can test locally first:

```bash
# Start local development
supabase start

# Test the function locally
supabase functions serve verify_ios_purchase
```

## Function Details

### Endpoint URL

After deployment, your function will be available at:
```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/verify_ios_purchase
```

### Request Format

**Method:** `POST`

**Headers:**
```
Authorization: Bearer YOUR_SUPABASE_ANON_KEY
Content-Type: application/json
```

**Body:**
```json
{
  "receipt": "base64_receipt_string",
  "transactionId": "1000000123456789",
  "productId": "com.deephorizon.security.individual.monthly.v1",
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

### Response Format

**Success:**
```json
{
  "success": true,
  "subscription": {
    "id": "uuid",
    "user_id": "uuid",
    "plan_id": "plan_RIADHZ91GxVCUn",
    "status": "active",
    "start_date": "2024-01-01T00:00:00Z",
    "end_date": "2024-02-01T00:00:00Z",
    "auto_renew": true,
    "payment_method": "ios_storekit",
    "transaction_id": "1000000123456789"
  },
  "isSandbox": false
}
```

**Error:**
```json
{
  "success": false,
  "error": "Error message here"
}
```

## What the Function Does

1. **Authenticates user** - Verifies the user is logged in
2. **Verifies receipt with Apple** - Calls Apple's verification API
3. **Checks transaction** - Validates the transaction exists in the receipt
4. **Creates/updates subscription** - Creates new subscription or updates existing one
5. **Returns subscription** - Returns the subscription details

## Database Schema

The function expects a `user_subscriptions` table with these columns:
- `id` (uuid, primary key)
- `user_id` (uuid, foreign key to auth.users)
- `plan_id` (text)
- `status` (text, e.g., 'active')
- `start_date` (timestamp)
- `end_date` (timestamp)
- `auto_renew` (boolean)
- `payment_method` (text, e.g., 'ios_storekit')
- `transaction_id` (text, optional)
- `created_at` (timestamp)
- `updated_at` (timestamp)

## Troubleshooting

### Error: "APPLE_SHARED_SECRET not configured"
- Make sure you've set the secret: `supabase secrets set APPLE_SHARED_SECRET=...`

### Error: "Receipt verification failed: 21007"
- This means the receipt is from sandbox. The function automatically handles this.

### Error: "Transaction not found in receipt"
- The transaction ID doesn't match. Check that you're sending the correct transaction ID.

### Error: "Unauthorized"
- Make sure you're sending the Authorization header with a valid Supabase token.

## Testing with Sandbox

1. Create a sandbox test account in App Store Connect
2. Test purchase in the app (will use sandbox)
3. The function will automatically detect sandbox receipts and verify them correctly

## Production Deployment

Once tested, deploy to production:

```bash
supabase functions deploy verify_ios_purchase --project-ref YOUR_PROJECT_REF
```

## Security Notes

- ✅ Receipt verification happens server-side (secure)
- ✅ User authentication is required
- ✅ Apple Shared Secret is stored as environment variable (not in code)
- ✅ Function uses Supabase service role key (has database access)

## Next Steps

After deploying:
1. ✅ Test with sandbox account
2. ✅ Verify subscriptions are created in database
3. ✅ Test restore purchases
4. ✅ Build and submit app

---

**Need Help?**
- [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions)
- [Apple Receipt Validation](https://developer.apple.com/documentation/appstorereceipts)
