import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

interface PoliciesScreenProps {
  navigation: any;
}

const PoliciesScreen: React.FC<PoliciesScreenProps> = ({ navigation }) => {
  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={[styles.header, { paddingTop: 10 }]}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <MaterialIcons name="arrow-back" size={24} color="#2C3E50" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Policies</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView 
        style={styles.content} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Privacy Policy Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy Policy</Text>
          <Text style={styles.sectionText}>
            Effective Date: 1st November, 2025
          </Text>
          
          <Text style={styles.paragraph}>
            The Deep Horizon App is owned and operated by Deep Horizon Security Technologies Pvt. Ltd. ("Company", "we", "our", or "us"). This Privacy Policy explains how we collect, use, and protect your personal information when you use our mobile application and related services.
          </Text>

          <Text style={styles.subtitle}>1. Information We Collect</Text>
          <Text style={styles.paragraph}>
            We may collect the following information when you use the Deep Horizon App:
          </Text>
          <Text style={styles.bullet}>• Personal details (name, mobile number, email)</Text>
          <Text style={styles.bullet}>• Location data (for live protection and emergency response features)</Text>
          <Text style={styles.bullet}>• Device information and usage data</Text>
          <Text style={styles.bullet}>• Payment information (processed securely through trusted gateways)</Text>
          <Text style={styles.paragraph}>
            We may also collect non-personal information such as app usage analytics, device type, and performance data to improve our services.
          </Text>

          <Text style={styles.subtitle}>2. How We Use Your Information</Text>
          <Text style={styles.paragraph}>
            Your data is used to:
          </Text>
          <Text style={styles.bullet}>• Provide and improve Deep Horizon's personal and urban security services</Text>
          <Text style={styles.bullet}>• Process payments and manage subscriptions</Text>
          <Text style={styles.bullet}>• Enable emergency features like live tracking and response</Text>
          <Text style={styles.bullet}>• Send alerts, service notifications, and updates</Text>
          <Text style={styles.bullet}>• Ensure compliance with safety and legal obligations</Text>
          <Text style={styles.paragraph}>
            We do not sell or rent your personal data to third parties.
          </Text>

          <Text style={styles.subtitle}>3. Data Security</Text>
          <Text style={styles.paragraph}>
            We use industry-standard security measures, including encryption and secure servers, to protect your information. However, no system is completely immune to breaches.
          </Text>

          <Text style={styles.subtitle}>4. Your Rights</Text>
          <Text style={styles.paragraph}>
            You may access, correct, or request deletion of your personal data, and withdraw consent where applicable, by contacting support@deephorizon.io.
          </Text>

          <Text style={styles.subtitle}>5. Third-Party Services</Text>
          <Text style={styles.paragraph}>
            Certain data may be shared with trusted partners—such as payment processors, cloud providers, and emergency service partners—only to deliver core app functions. All partners operate under strict confidentiality agreements.
          </Text>

          <Text style={styles.subtitle}>6. Policy Updates</Text>
          <Text style={styles.paragraph}>
            We may update this policy from time to time. The latest version will always be available within the app and at www.deephorizon.io
          </Text>
          
          <Text style={styles.subtitle}>7. Contact Us</Text>
          <Text style={styles.paragraph}>
            Deep Horizon Security Technologies Pvt. Ltd.
          </Text>
          <Text style={styles.contactInfo}>Email: support@deephorizon.io</Text>
          <Text style={styles.contactInfo}>Website: http://www.deephorizon.io/</Text>
        </View>

        {/* Refund and Cancellation Policy Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Refund & Cancellation Policy</Text>
          <Text style={styles.sectionText}>
            Effective Date: 1st November, 2025
          </Text>
          
          <Text style={styles.paragraph}>
            The Deep Horizon App is owned and operated by Deep Horizon Security Technologies Pvt. Ltd. ("Company", "we", "our", or "us"). We strive to deliver seamless, reliable, and technology-enabled personal security services to our users. Please review this policy before making any in-app purchase.
          </Text>

          <Text style={styles.subtitle}>1. General Terms</Text>
          <Text style={styles.paragraph}>
            All purchases made through the Deep Horizon App, including subscriptions, credits, and premium features, are non-transferable and generally non-refundable once confirmed. Users are advised to review all pricing and feature details before completing a payment.
          </Text>

          <Text style={styles.subtitle}>2. Cancellation Policy</Text>
          <Text style={styles.bullet}>• Users may cancel their subscription anytime through their app store account (Google Play or Apple App Store).</Text>
          <Text style={styles.bullet}>• Cancellation stops auto-renewal; access continues until the current billing cycle ends.</Text>
          <Text style={styles.bullet}>• One-time purchases and credit packs cannot be cancelled once completed.</Text>

          <Text style={styles.subtitle}>3. Refund Eligibility</Text>
          <Text style={styles.paragraph}>
            Refunds are only applicable under the following verified conditions:
          </Text>
          <Text style={styles.bullet}>• Payment processed but service not activated due to a technical issue.</Text>
          <Text style={styles.bullet}>• Duplicate charges for the same transaction.</Text>
          <Text style={styles.bullet}>• Annual plan cancelled within 7 days of purchase, provided no premium feature has been used.</Text>
          <Text style={styles.paragraph}>
            All other payments are non-refundable once access or usage begins.
          </Text>

          <Text style={styles.subtitle}>4. Refund Process</Text>
          <Text style={styles.paragraph}>
            To request a refund, email support@deephorizon.io within 7 days of purchase with your registered number, transaction ID, and issue details.
          </Text>
          <Text style={styles.paragraph}>
            Approved refunds will be processed within 7–10 business days via the original payment method. If your payment was made via the Google Play Store or Apple App Store, the refund will be subject to their respective refund policies.
          </Text>
          
          <Text style={styles.subtitle}>5. Contact</Text>
          <Text style={styles.paragraph}>
            Deep Horizon Security Technologies Pvt. Ltd.
          </Text>
          <Text style={styles.contactInfo}>Email: support@deephorizon.io</Text>
          <Text style={styles.contactInfo}>Website: http://www.deephorizon.io/</Text>
          <Text style={[styles.paragraph, {fontStyle: 'italic', marginTop: 8}]}>
            Note: This policy is governed by and construed in accordance with the laws of India. Deep Horizon Security Technologies Pvt. Ltd. reserves the right to update or modify this policy at any time.
          </Text>
        </View>

        {/* Terms of Service Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Terms of Service</Text>
          <Text style={styles.sectionText}>
            Effective Date: 1st November, 2025
          </Text>
          
          <Text style={styles.paragraph}>
            Entity: Deep Horizon Security Technologies Pvt. Ltd.
          </Text>
          <Text style={styles.paragraph}>
            Contact: support@deephorizon.io
          </Text>

          <Text style={styles.subtitle}>1. About Deep Horizon</Text>
          <Text style={styles.paragraph}>
            Deep Horizon is a safety companion app developed and operated by Deep Horizon Security Technologies Pvt. Ltd. It helps users stay safe through real-time alerts, emergency tracking, and digital coordination tools.
          </Text>
          <Text style={styles.paragraph}>
            Deep Horizon is not a private security agency. It does not deploy or employ security guards directly.
          </Text>
          <Text style={styles.paragraph}>
            Any physical response is provided only through PSARA-licensed partners or official emergency services such as 112.
          </Text>

          <Text style={styles.subtitle}>2. How the App Works</Text>
          <Text style={styles.paragraph}>
            Deep Horizon enables users to:
          </Text>
          <Text style={styles.bullet}>• Send emergency alerts to trusted contacts or responders</Text>
          <Text style={styles.bullet}>• Share real-time location for assistance</Text>
          <Text style={styles.bullet}>• Access in-app safety features and premium tools</Text>
          <Text style={styles.bullet}>• Connect with licensed security partners where available</Text>
          <Text style={styles.paragraph}>
            The service works best when you grant necessary permissions like location and notifications.
          </Text>

          <Text style={styles.subtitle}>3. User Agreement</Text>
          <Text style={styles.paragraph}>
            By using this app, you agree that:
          </Text>
          <Text style={styles.bullet}>• Deep Horizon is a digital companion platform, not a replacement for police or professional security.</Text>
          <Text style={styles.bullet}>• You will use the app responsibly and provide accurate contact details.</Text>
          <Text style={styles.bullet}>• Misuse, false alerts, or illegal use of the app may result in suspension of your account.</Text>

          <Text style={styles.subtitle}>4. Payments & Refunds</Text>
          <Text style={styles.paragraph}>
            Some services may require a subscription or in-app purchase.
          </Text>
          <Text style={styles.paragraph}>
            All payments and cancellations are governed by our Refund & Cancellation Policy, available in the app and on our website.
          </Text>

          <Text style={styles.subtitle}>5. Privacy & Data</Text>
          <Text style={styles.paragraph}>
            Your personal information and location data are handled as per our Privacy Policy, compliant with the Digital Personal Data Protection Act, 2023 (India).
          </Text>
          <Text style={styles.paragraph}>
            We never sell or rent your personal information.
          </Text>

          <Text style={styles.subtitle}>6. Disclaimer</Text>
          <Text style={styles.paragraph}>
            While Deep Horizon strives to provide real-time safety tools, we cannot guarantee immediate response in all situations. Network, device, or geographic factors may affect service availability.
          </Text>
          <Text style={styles.paragraph}>
            Always contact 112 (Emergency Response Support System) or local police in critical emergencies.
          </Text>
          
          <Text style={styles.subtitle}>7. Limitation of Liability</Text>
          <Text style={styles.paragraph}>
            Deep Horizon and its affiliates shall not be responsible for:
          </Text>
          <Text style={styles.bullet}>• Delays or technical issues beyond our control</Text>
          <Text style={styles.bullet}>• The actions of third-party responders or partners</Text>
          <Text style={styles.bullet}>• Any incidental or consequential damages from app use</Text>

          <Text style={styles.subtitle}>8. Termination</Text>
          <Text style={styles.paragraph}>
            We may suspend or terminate access for misuse or policy violations.
          </Text>

          <Text style={styles.subtitle}>9. Governing Law</Text>
          <Text style={styles.paragraph}>
            These Terms are governed by the laws of India.
          </Text>
          <Text style={styles.paragraph}>
            Jurisdiction: Courts of Guwahati, Assam.
          </Text>

          <Text style={styles.subtitle}>10. Contact Us</Text>
          <Text style={styles.paragraph}>
            For questions, feedback, or complaints:
          </Text>
          <Text style={styles.contactInfo}>Email: support@deephorizon.io</Text>
          <Text style={styles.contactInfo}>Website: www.deephorizon.io</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2C3E50',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  section: {
    marginTop: 24,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  sectionText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    fontStyle: 'italic',
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginTop: 16,
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 15,
    lineHeight: 22,
    color: '#333',
    marginBottom: 12,
  },
  bullet: {
    fontSize: 15,
    lineHeight: 22,
    color: '#333',
    marginLeft: 16,
    marginBottom: 8,
  },
  contactInfo: {
    fontSize: 15,
    lineHeight: 22,
    color: '#007AFF',
    marginBottom: 8,
    fontWeight: '500',
  },
});

export default PoliciesScreen;

