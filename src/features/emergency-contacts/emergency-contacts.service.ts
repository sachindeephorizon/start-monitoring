/**
 * Emergency Contacts Service
 *
 * Manages emergency contacts for users.
 * Proxy-first: uses dashboard API (always reachable via Vercel), falls back to direct Supabase.
 */

import { supabase, ensureValidSession } from '@/lib/supabase';
import { AuthService } from '@/core/auth/auth.service';
import { apiBaseUrl } from '@/config/environment';

export interface EmergencyContact {
  id: string;
  mobile_user_id: string;
  contact_name: string;
  contact_phone: string;
  contact_email?: string;
  relationship?: string;
  created_at: string;
}

export interface CreateEmergencyContactData {
  contact_name: string;
  contact_phone: string;
  contact_email?: string;
  relationship?: string;
}

export interface UpdateEmergencyContactData {
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  relationship?: string;
}

export class EmergencyContactsService {
  private static async getAuthedSession(): Promise<{ userId: string; accessToken: string | null }> {
    const session = await ensureValidSession();
    const id = session?.user?.id;
    if (!id) {
      throw new Error('User not authenticated');
    }
    return { userId: id, accessToken: (session as any)?.access_token ?? null };
  }

  private static async getAuthedUserId(): Promise<string> {
    const { userId } = await this.getAuthedSession();
    return userId;
  }

  /**
   * Fetch contacts via dashboard proxy.
   * Throws on failure so caller can fall back to direct Supabase.
   */
  private static async _getUserContactsViaProxy(
    accessToken: string
  ): Promise<{ contacts: EmergencyContact[]; error: string | null }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(`${apiBaseUrl}/api/mobile/emergency-contacts`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Proxy error: ${res.status}`);
      }

      const json = await res.json();
      const data = json?.data || json;
      const contacts = data?.contacts ?? [];
      console.log('[EmergencyContacts] Contacts fetched via dashboard proxy:', contacts.length);
      return { contacts, error: null };
    } catch (e: any) {
      clearTimeout(timeoutId);
      throw e;
    }
  }

  /**
   * Get all emergency contacts for the current user.
   * Proxy-first: dashboard API, then direct Supabase fallback.
   */
  static async getUserContacts(): Promise<{ contacts: EmergencyContact[]; error: string | null }> {
    try {
      const { userId, accessToken } = await this.getAuthedSession();

      console.log('[EmergencyContacts] Fetching contacts for user:', userId);

      // Proxy-first: dashboard API is always reachable via Vercel
      if (accessToken) {
        try {
          return await this._getUserContactsViaProxy(accessToken);
        } catch (proxyErr: any) {
          console.warn('[EmergencyContacts] Proxy failed, falling back to direct Supabase:', proxyErr?.message);
        }
      }

      // Fallback: direct Supabase query
      const { data: contacts, error } = await supabase
        .from('emergency_contacts')
        .select('*')
        .eq('mobile_user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[EmergencyContacts] Error querying emergency_contacts table:', error);
      } else {
        console.log('[EmergencyContacts] Found contacts via direct Supabase:', contacts?.length || 0);
        if (contacts && contacts.length > 0) {
          return { contacts, error: null };
        }
      }

      // If no contacts found, check if emergency contact exists in mobile_users table and sync it
      console.log('[EmergencyContacts] No contacts found, checking mobile_users table...');
      const { data: mobileUser, error: mobileUserError } = await supabase
        .from('mobile_users')
        .select('emergency_contact_name, emergency_contact_phone, emergency_contact_relationship')
        .eq('id', userId)
        .single();

      if (mobileUserError) {
        console.error('[EmergencyContacts] Error fetching mobile_user:', mobileUserError);
      }

      if (!mobileUserError && mobileUser && mobileUser.emergency_contact_name && mobileUser.emergency_contact_phone) {
        console.log('[EmergencyContacts] Syncing contact from mobile_users to emergency_contacts...');
        const contactPayload = {
          mobile_user_id: userId,
          contact_name: mobileUser.emergency_contact_name,
          contact_phone: mobileUser.emergency_contact_phone,
          relationship: mobileUser.emergency_contact_relationship || null,
          contact_email: null,
        };

        const { data: syncedContact, error: syncError } = await supabase
          .from('emergency_contacts')
          .insert(contactPayload)
          .select()
          .single();

        if (syncError) {
          console.error('[EmergencyContacts] Error syncing contact:', syncError);
          return {
            contacts: [{
              id: 'temp-' + Date.now(),
              mobile_user_id: userId,
              contact_name: mobileUser.emergency_contact_name,
              contact_phone: mobileUser.emergency_contact_phone,
              relationship: mobileUser.emergency_contact_relationship || undefined,
              contact_email: undefined,
              created_at: new Date().toISOString()
            }],
            error: null
          };
        }

        if (syncedContact) {
          console.log('[EmergencyContacts] Successfully synced contact:', syncedContact.id);
          return { contacts: [syncedContact], error: null };
        }
      }

      console.log('[EmergencyContacts] No emergency contacts found');
      return { contacts: [], error: null };
    } catch (error: any) {
      console.error('[EmergencyContacts] Error fetching emergency contacts:', error);
      return { contacts: [], error: error.message };
    }
  }

  /**
   * Create a new emergency contact
   */
  static async createContact(contactData: CreateEmergencyContactData): Promise<{ contact: EmergencyContact | null; error: string | null }> {
    try {
      const userId = await this.getAuthedUserId();

      const { data: contact, error } = await supabase
        .from('emergency_contacts')
        .insert({
          mobile_user_id: userId,
          contact_name: contactData.contact_name,
          contact_phone: contactData.contact_phone,
          contact_email: contactData.contact_email,
          relationship: contactData.relationship,
        })
        .select()
        .single();

      if (error) throw error;

      return { contact, error: null };
    } catch (error: any) {
      console.error('Error creating emergency contact:', error);
      return { contact: null, error: error.message };
    }
  }

  /**
   * Update an emergency contact
   */
  static async updateContact(contactId: string, updateData: UpdateEmergencyContactData): Promise<{ contact: EmergencyContact | null; error: string | null }> {
    try {
      const userId = await this.getAuthedUserId();

      const { data: contact, error } = await supabase
        .from('emergency_contacts')
        .update(updateData)
        .eq('id', contactId)
        .eq('mobile_user_id', userId) // Ensure user owns this contact
        .select()
        .single();

      if (error) throw error;

      return { contact, error: null };
    } catch (error: any) {
      console.error('Error updating emergency contact:', error);
      return { contact: null, error: error.message };
    }
  }

  /**
   * Delete an emergency contact
   */
  static async deleteContact(contactId: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const userId = await this.getAuthedUserId();

      const { error } = await supabase
        .from('emergency_contacts')
        .delete()
        .eq('id', contactId)
        .eq('mobile_user_id', userId); // Ensure user owns this contact

      if (error) throw error;

      return { success: true, error: null };
    } catch (error: any) {
      console.error('Error deleting emergency contact:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send test notification to all contacts
   */
  static async sendTestNotifications(): Promise<{ success: boolean; error: string | null }> {
    try {
      // Ensure authenticated
      await this.getAuthedUserId();

      // Get all user's contacts
      const { contacts } = await this.getUserContacts();

      if (contacts.length === 0) {
        return { success: false, error: 'No emergency contacts configured' };
      }

      // TODO: Implement actual notification sending logic
      // For now, just simulate success
      console.log('Sending test notifications to:', contacts.map(c => c.contact_name));

      return { success: true, error: null };
    } catch (error: any) {
      console.error('Error sending test notifications:', error);
      return { success: false, error: error.message };
    }
  }
}
