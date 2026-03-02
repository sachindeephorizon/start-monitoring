/**
 * Legal Screen Component
 * 
 * Displays legal documents (Privacy Policy, Terms of Service, Refund Policy).
 * 
 * iOS SAFETY:
 * - Static content (no business logic)
 * - App Store-compliant language
 * - Required for App Store submission
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';

export type LegalDocumentType = 'privacy' | 'terms' | 'refund';

interface LegalScreenProps {
  documentType: LegalDocumentType;
}

/**
 * Get document title
 */
function getDocumentTitle(type: LegalDocumentType): string {
  switch (type) {
    case 'privacy':
      return 'Privacy Policy';
    case 'terms':
      return 'Terms of Service';
    case 'refund':
      return 'Refund Policy';
    default:
      return 'Legal';
  }
}

/**
 * Get document content
 * 
 * In production, this would fetch from server or use static files.
 * For now, returns placeholder content.
 */
function getDocumentContent(type: LegalDocumentType): string {
  // TODO: Replace with actual legal document content
  // This should be fetched from server or stored as static content
  switch (type) {
    case 'privacy':
      return `PRIVACY POLICY

Last Updated: [Date]

1. INFORMATION WE COLLECT
We collect information you provide directly to us, including:
- Account information (name, email, phone)
- Location data (for safety tracking)
- Emergency contact information
- Medical information (optional, if provided)

2. HOW WE USE YOUR INFORMATION
We use your information to:
- Provide safety and security services
- Respond to emergencies
- Communicate with you and assigned agents
- Process payments and manage subscriptions

3. DATA SHARING
We share your information with:
- Assigned security agents (for service delivery)
- Emergency services (when necessary)
- Payment processors (for transaction processing)

We do not sell your personal information.

4. DATA SECURITY
We implement appropriate technical and organizational measures to protect your data.

5. YOUR RIGHTS
You have the right to:
- Access your personal data
- Correct inaccurate data
- Request deletion of your data
- Object to processing of your data

6. CONTACT US
For privacy concerns, contact: privacy@deephorizon.com

This is a placeholder. Please replace with actual Privacy Policy content.`;
    case 'terms':
      return `TERMS OF SERVICE

Last Updated: [Date]

1. ACCEPTANCE OF TERMS
By using DeepHorizon Security, you agree to these Terms of Service.

2. SERVICE DESCRIPTION
DeepHorizon provides personal safety and security services including:
- Real-time location tracking
- Emergency response
- Security agent communication
- Bodyguard services

3. USER OBLIGATIONS
You agree to:
- Provide accurate information
- Use the service in accordance with applicable laws
- Maintain the security of your account
- Not misuse the service

4. SUBSCRIPTION AND PAYMENT
- Subscriptions are billed according to selected plan
- Payments are non-refundable except as stated in Refund Policy
- You may cancel your subscription at any time

5. LIMITATION OF LIABILITY
DeepHorizon is not liable for:
- Events outside our reasonable control
- Third-party actions
- User negligence

6. TERMINATION
We may terminate your account for violation of these terms.

7. CONTACT US
For questions, contact: support@deephorizon.com

This is a placeholder. Please replace with actual Terms of Service content.`;
    case 'refund':
      return `REFUND POLICY

Last Updated: [Date]

1. REFUND ELIGIBILITY
- Refunds are available within 7 days of subscription purchase
- Refunds are processed for unused portions of subscription
- Emergency services and completed bookings are non-refundable

2. REFUND PROCESS
To request a refund:
- Contact support@deephorizon.com
- Provide subscription details
- Refunds processed within 5-10 business days

3. NON-REFUNDABLE ITEMS
- Completed bodyguard services
- Completed video/audio call sessions
- Services already rendered

4. CANCELLATION
You may cancel your subscription at any time. Cancellation takes effect at the end of the current billing period.

5. CONTACT US
For refund requests, contact: support@deephorizon.com

This is a placeholder. Please replace with actual Refund Policy content.`;
    default:
      return 'Document not available';
  }
}

export function LegalScreen({ documentType }: LegalScreenProps) {
  const [content] = useState(() => getDocumentContent(documentType));
  const title = getDocumentTitle(documentType);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.contentText}>{content}</Text>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          For questions or concerns, please contact support@deephorizon.com
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    padding: 20,
    paddingBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  content: {
    padding: 20,
  },
  contentText: {
    fontSize: 14,
    color: '#ccc',
    lineHeight: 24,
  },
  footer: {
    padding: 20,
    paddingTop: 10,
  },
  footerText: {
    fontSize: 14,
    color: '#888',
    lineHeight: 20,
    fontStyle: 'italic',
  },
});

