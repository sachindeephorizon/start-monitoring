# Account Deletion - Data Deletion Analysis

## Current Implementation

The account deletion Edge Function (`supabase/functions/delete_user_account/index.ts`) uses:
```typescript
supabaseAdmin.auth.admin.deleteUser(user.id)
```

This deletes the user from `auth.users`, which **should** cascade delete related data **IF** all foreign keys have `ON DELETE CASCADE` constraints.

## What WILL Be Deleted (Has CASCADE)

Based on the PRD schema documentation, these tables have `ON DELETE CASCADE`:

1. ✅ **`mobile_users`** → Deleted when `auth.users` is deleted
   - Foreign Key: `id` → `auth.users(id)` ON DELETE CASCADE

2. ✅ **`emergency_contacts`** → Deleted when `mobile_users` is deleted
   - Foreign Key: `mobile_user_id` → `mobile_users(id)` ON DELETE CASCADE

3. ✅ **`chat_requests`** → Deleted when `mobile_users` is deleted
   - Foreign Key: `mobile_user_id` → `mobile_users(id)` ON DELETE CASCADE

4. ✅ **`tracking_sessions`** → Deleted when `mobile_users` is deleted
   - Foreign Key: `mobile_user_id` → `mobile_users(id)` ON DELETE CASCADE

5. ✅ **`tracking_checkins`** → Deleted when `tracking_sessions` is deleted
   - Foreign Key: `tracking_session_id` → `tracking_sessions(id)` ON DELETE CASCADE

6. ✅ **`tracking_locations`** → Deleted when `tracking_sessions` is deleted
   - Foreign Key: `tracking_session_id` → `tracking_sessions(id)` ON DELETE CASCADE

7. ✅ **`tracking_agent_actions`** → Deleted when `tracking_sessions` is deleted
   - Foreign Key: `tracking_session_id` → `tracking_sessions(id)` ON DELETE CASCADE

8. ✅ **`audio_sessions`** → Deleted when `mobile_users` is deleted
   - Foreign Key: `mobile_user_id` → `mobile_users(id)` ON DELETE CASCADE

## What MIGHT NOT Be Deleted (No Explicit CASCADE Mentioned)

Based on the PRD, these tables **do not explicitly mention** `ON DELETE CASCADE`:

1. ⚠️ **`checkins`** 
   - Foreign Key: `mobile_user_id` → `mobile_users(id)` 
   - **Status**: No CASCADE mentioned - data may remain orphaned

2. ⚠️ **`user_subscriptions`**
   - Foreign Key: `user_id` → `mobile_users(id)`
   - **Status**: No CASCADE mentioned - subscription records may remain

3. ⚠️ **`family_members`**
   - Foreign Key: `user_id` → `mobile_users(id)` (if member has account)
   - Foreign Key: `subscription_id` → `user_subscriptions(id)`
   - **Status**: No CASCADE mentioned - family member links may remain

4. ⚠️ **`emergencies`**
   - Foreign Key: `mobile_user_id` → `mobile_users(id)`
   - **Status**: No CASCADE mentioned - emergency records may remain

5. ⚠️ **`incident_logs`**
   - Foreign Key: `user_id` → `mobile_users(id)`
   - **Status**: No CASCADE mentioned - audit logs may remain

## ⚠️ CRITICAL ISSUE

**The current implementation may NOT delete all user data** if the database foreign keys don't have `ON DELETE CASCADE` constraints set up.

## Recommended Solution

### Option 1: Verify and Add CASCADE Constraints (Recommended)

Create a migration to ensure all foreign keys have `ON DELETE CASCADE`:

```sql
-- Add CASCADE to checkins
ALTER TABLE checkins 
  DROP CONSTRAINT IF EXISTS checkins_mobile_user_id_fkey,
  ADD CONSTRAINT checkins_mobile_user_id_fkey 
    FOREIGN KEY (mobile_user_id) 
    REFERENCES mobile_users(id) 
    ON DELETE CASCADE;

-- Add CASCADE to user_subscriptions
ALTER TABLE user_subscriptions 
  DROP CONSTRAINT IF EXISTS user_subscriptions_user_id_fkey,
  ADD CONSTRAINT user_subscriptions_user_id_fkey 
    FOREIGN KEY (user_id) 
    REFERENCES mobile_users(id) 
    ON DELETE CASCADE;

-- Add CASCADE to family_members (user_id)
ALTER TABLE family_members 
  DROP CONSTRAINT IF EXISTS family_members_user_id_fkey,
  ADD CONSTRAINT family_members_user_id_fkey 
    FOREIGN KEY (user_id) 
    REFERENCES mobile_users(id) 
    ON DELETE CASCADE;

-- Add CASCADE to emergencies
ALTER TABLE emergencies 
  DROP CONSTRAINT IF EXISTS emergencies_mobile_user_id_fkey,
  ADD CONSTRAINT emergencies_mobile_user_id_fkey 
    FOREIGN KEY (mobile_user_id) 
    REFERENCES mobile_users(id) 
    ON DELETE CASCADE;

-- Add CASCADE to incident_logs
ALTER TABLE incident_logs 
  DROP CONSTRAINT IF EXISTS incident_logs_user_id_fkey,
  ADD CONSTRAINT incident_logs_user_id_fkey 
    FOREIGN KEY (user_id) 
    REFERENCES mobile_users(id) 
    ON DELETE CASCADE;
```

### Option 2: Explicit Deletion in Edge Function (More Reliable)

Update the Edge Function to explicitly delete related data before deleting the user:

```typescript
// Explicitly delete related data before deleting user
// This ensures complete deletion even if CASCADE isn't set up

// 1. Delete checkins
await supabaseAdmin
  .from('checkins')
  .delete()
  .eq('mobile_user_id', user.id);

// 2. Delete user subscriptions (this will cascade delete family_members via subscription_id)
await supabaseAdmin
  .from('user_subscriptions')
  .delete()
  .eq('user_id', user.id);

// 3. Delete family_members where user_id matches (if member has account)
await supabaseAdmin
  .from('family_members')
  .delete()
  .eq('user_id', user.id);

// 4. Delete emergencies
await supabaseAdmin
  .from('emergencies')
  .delete()
  .eq('mobile_user_id', user.id);

// 5. Delete incident_logs
await supabaseAdmin
  .from('incident_logs')
  .delete()
  .eq('user_id', user.id);

// 6. Finally, delete the user (this will cascade delete mobile_users and other CASCADE tables)
await supabaseAdmin.auth.admin.deleteUser(user.id);
```

## Recommendation

**Use BOTH approaches:**
1. Add CASCADE constraints via migration (ensures database-level integrity)
2. Update Edge Function with explicit deletions (ensures complete deletion even if constraints fail)

This provides **defense in depth** and ensures complete data deletion for App Store compliance.

## Testing

After implementing, test account deletion and verify:
1. ✅ `auth.users` record is deleted
2. ✅ `mobile_users` record is deleted
3. ✅ All `checkins` are deleted
4. ✅ All `user_subscriptions` are deleted
5. ✅ All `family_members` with matching `user_id` are deleted
6. ✅ All `emergencies` are deleted
7. ✅ All `incident_logs` are deleted
8. ✅ All related data in CASCADE tables is deleted
