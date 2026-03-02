# Testing iOS Purchases - Step by Step

## ✅ What's Done

- [x] Products created in App Store Connect
- [x] Code updated with Product IDs
- [x] Supabase Edge Function deployed
- [x] Apple Shared Secret configured

## Step 1: Create Sandbox Test Account

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Navigate to: **Users and Access** → **Sandbox Testers**
3. Click **"+"** button to create new test account
4. Fill in:
   - **Email**: Use a unique email (e.g., `test1@example.com`)
   - **Password**: Create a password
   - **First Name**: Test
   - **Last Name**: User
   - **Country/Region**: Select your region
5. Click **"Save"**

**Important**: 
- Use a different email domain than your real Apple ID
- You can create multiple test accounts
- These accounts are only for testing purchases

## Step 2: Build and Install App

```bash
cd Deephorizon-security

# Build for iOS device
npx expo run:ios

# OR if you want to use EAS build
eas build --platform ios --profile development
```

## Step 3: Sign Out of App Store on Test Device

**Critical Step**: You must sign out of your real Apple ID on the test device!

1. On your iPhone/iPad:
   - Go to **Settings** → **App Store**
   - Tap on your Apple ID at the top
   - Tap **"Sign Out"**

2. **Do NOT sign in with your real Apple ID** during testing

## Step 4: Test Purchase Flow

1. **Open the app** on your test device
2. **Sign up or log in** with a test account
3. **Navigate to Subscription Plans** screen
4. **Select a plan** (e.g., Individual Monthly)
5. **Tap to purchase**
6. **When prompted for Apple ID**:
   - Enter your **sandbox test account** credentials
   - NOT your real Apple ID!
7. **Complete the purchase**
8. **Verify**:
   - Purchase should complete successfully
   - Subscription should be created in database
   - App should show subscription as active

## Step 5: Verify in Database

Check that subscription was created:

1. Go to Supabase Dashboard
2. Navigate to **Table Editor** → **user_subscriptions**
3. Look for a new record with:
   - `user_id`: Your test user's ID
   - `plan_id`: The plan you purchased (e.g., `plan_RIADHZ91GxVCUn`)
   - `status`: `active`
   - `payment_method`: `ios_storekit`
   - `transaction_id`: Should have a transaction ID

## Step 6: Test Restore Purchases

1. In the app, go to **Settings** or **Subscription** screen
2. Look for **"Restore Purchases"** button (if available)
3. Or test by:
   - Uninstalling and reinstalling the app
   - Signing in with same account
   - Subscription should be restored automatically

## Step 7: Test Family Plan (Optional)

1. Purchase Family Plan with sandbox account
2. Add family member (phone number)
3. Sign up with family member's phone number
4. Verify family member gets access automatically

## Troubleshooting

### Issue: "No products found"
- **Solution**: Wait a few minutes after creating products in App Store Connect
- **Solution**: Ensure Product IDs match exactly (case-sensitive)
- **Solution**: Rebuild the app

### Issue: "Receipt verification failed"
- **Solution**: Check Supabase function logs
- **Solution**: Verify `APPLE_SHARED_SECRET` is set correctly
- **Solution**: Check that function is deployed

### Issue: Sandbox purchase not working
- **Solution**: Make sure you signed out of real Apple ID
- **Solution**: Use sandbox test account credentials
- **Solution**: Check products are in "Ready to Submit" status

### Issue: Subscription not created in database
- **Solution**: Check Supabase function logs for errors
- **Solution**: Verify database permissions (RLS policies)
- **Solution**: Check function is calling correct table name

## Check Function Logs

To see what's happening:

```bash
# View function logs
supabase functions logs verify_ios_purchase
```

Or in Supabase Dashboard:
- Go to **Edge Functions** → **verify_ios_purchase** → **Logs**

## Success Criteria

✅ Purchase completes without errors
✅ Subscription record created in `user_subscriptions` table
✅ App shows subscription as active
✅ User can access premium features
✅ Restore purchases works

## Next Steps After Testing

Once everything works:
1. ✅ Test all 4 subscription plans
2. ✅ Test restore purchases
3. ✅ Test family plan flow
4. ✅ Build production version
5. ✅ Submit to App Store

---

**Ready to test?** Start with Step 1 (create sandbox account)!
