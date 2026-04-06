import React from 'react';
import { TouchableOpacity, View, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { serviceCardStyles } from '@/styles/ServiceCard.styles';

type SecurityAgentContactCardProps = {
  isStartingCall: boolean;
  hasActiveChatBadge: boolean;
  onStartAudioCall: () => void;
  onOpenChat: () => void;
  onStartVideoCall: () => void;
};

export default function SecurityAgentContactCard({
  isStartingCall,
  hasActiveChatBadge,
  onStartAudioCall,
  onOpenChat,
  onStartVideoCall,
}: SecurityAgentContactCardProps) {
  return (
    <View
      style={serviceCardStyles.securityAgentCard}
      accessible={true}
      accessibilityLabel="Security Agent contact options"
    >
      <Text style={serviceCardStyles.securityAgentTitle}>Security Agent</Text>
      <View style={serviceCardStyles.contactIcons}>
        <TouchableOpacity
          style={[serviceCardStyles.contactIcon, isStartingCall && { opacity: 0.5 }]}
          onPress={onStartAudioCall}
          disabled={isStartingCall}
          accessible={true}
          accessibilityLabel="Call security agent"
          accessibilityRole="button"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons name="phone" size={24} color="#2C3E50" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            serviceCardStyles.contactIcon,
            serviceCardStyles.contactIconSpacing,
            hasActiveChatBadge && serviceCardStyles.contactIconActive,
          ]}
          onPress={onOpenChat}
          accessible={true}
          accessibilityLabel="Chat with security agent"
          accessibilityRole="button"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          {/* {hasActiveChatBadge && <View style={serviceCardStyles.activeBadgeDot} />} */}
          <MaterialIcons name="chat" size={24} color={hasActiveChatBadge ? '#FFFFFF' : '#2C3E50'} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[serviceCardStyles.contactIcon, serviceCardStyles.contactIconSpacing, isStartingCall && { opacity: 0.5 }]}
          onPress={onStartVideoCall}
          disabled={isStartingCall}
          accessible={true}
          accessibilityLabel="Video call security agent"
          accessibilityRole="button"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons name="videocam" size={24} color="#2C3E50" />
        </TouchableOpacity>
      </View>
    </View>
  );
}
