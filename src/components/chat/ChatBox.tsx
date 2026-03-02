import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { styles } from './ChatBox.styles';
 

interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'agent';
  timestamp: Date;
}

interface ChatBoxProps {
  visible: boolean;
  chatMessages: ChatMessage[];
  chatInput: string;
  isTyping: boolean;
  isSending?: boolean;
  onClose: () => void;
  onChatInputChange: (text: string) => void;
  onSendMessage: (text?: string) => void;
  formatChatTime: (date: Date) => string;
}

const ChatBox: React.FC<ChatBoxProps> = ({
  visible,
  chatMessages,
  chatInput,
  isTyping,
  isSending,
  onClose,
  onChatInputChange,
  onSendMessage,
  formatChatTime,
}) => {
  const quickResponses = ['I need help', 'Emergency assistance', 'Check my location', 'I\'m safe'];
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);

  const handleQuickResponse = (response: string) => {
    if (isSending) return;
    // Pass text directly to avoid stale-closure race condition
    onSendMessage(response);
  };

  // Scroll to bottom when new messages arrive or typing indicator appears
  useEffect(() => {
    if (visible && (chatMessages.length > 0 || isTyping)) {
      // Avoid setTimeout on iOS (can be throttled). Use rAF to align with layout.
      requestAnimationFrame(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      });
    }
  }, [chatMessages.length, isTyping, visible]);

  // Scroll to bottom when keyboard opens
  useEffect(() => {
    if (visible) {
      const keyboardWillShow = Keyboard.addListener(
        Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
        () => {
          requestAnimationFrame(() => {
            scrollViewRef.current?.scrollToEnd({ animated: true });
          });
        }
      );

      return () => {
        keyboardWillShow.remove();
      };
    }
  }, [visible]);

  return (
    <Modal
      animationType="slide"
      transparent={false}
      visible={visible}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.chatContainer} edges={['top']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          {/* Chat Header */}
          <View style={styles.chatHeader}>
            <TouchableOpacity
              style={styles.chatBackButton}
              onPress={() => {
                Keyboard.dismiss();
                onClose();
              }}
              accessible={true}
              accessibilityLabel="Close chat"
              accessibilityRole="button"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="arrow-back" size={24} color="#ffffff" />
            </TouchableOpacity>

            <View style={styles.chatAgentInfo}>
              <View style={styles.chatAgentAvatar}>
                <Text style={styles.chatAgentInitials}>SA</Text>
              </View>
              <View style={styles.chatAgentDetails}>
                <Text style={styles.chatAgentName}>Security Agent</Text>
                <View style={styles.chatOnlineStatus}>
                  <View style={styles.chatOnlineDot} />
                  <Text style={styles.chatOnlineText}>Online</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={styles.chatCallButton}
              accessible={true}
              accessibilityLabel="Call security agent"
              accessibilityRole="button"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="phone" size={22} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {/* Chat Messages */}
          <ScrollView 
            ref={scrollViewRef}
            style={styles.chatMessagesContainer}
            contentContainerStyle={styles.chatMessagesContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            {chatMessages.map((message, idx) => (
              <View 
                key={`${message.id}-${idx}`} 
                style={[
                  styles.chatMessageBubble,
                  message.sender === 'user' ? styles.chatUserMessage : styles.chatAgentMessage
                ]}
              >
                <Text style={[
                  styles.chatMessageText,
                  message.sender === 'user' ? styles.chatUserMessageText : styles.chatAgentMessageText
                ]}>
                  {message.text}
                </Text>
                <Text style={[
                  styles.chatMessageTime,
                  message.sender === 'user' ? styles.chatUserMessageTime : styles.chatAgentMessageTime
                ]}>
                  {formatChatTime(message.timestamp)}
                </Text>
              </View>
            ))}
            
            {isTyping && (
              <View style={[styles.chatMessageBubble, styles.chatAgentMessage]}>
                <View style={styles.chatTypingIndicator}>
                  <Text style={styles.chatTypingText}>Security Agent is typing</Text>
                  <View style={styles.chatTypingDots}>
                    <View style={styles.chatTypingDot} />
                    <View style={styles.chatTypingDot} />
                    <View style={styles.chatTypingDot} />
                  </View>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Quick Response Buttons */}
          <View style={styles.chatQuickResponses}>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chatQuickResponsesContent}
            >
              {quickResponses.map((response) => (
                <TouchableOpacity
                  key={response}
                  style={styles.chatQuickResponseButton}
                  onPress={() => handleQuickResponse(response)}
                >
                  <Text style={styles.chatQuickResponseText}>{response}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Chat Input */}
          <View style={[styles.chatInputContainer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={styles.chatInputWrapper}>
              <TextInput
                style={styles.chatInput}
                placeholder="Type a message..."
                placeholderTextColor="#bdc3c7"
                value={chatInput}
                onChangeText={onChatInputChange}
                multiline={true}
                maxLength={500}
                textAlignVertical="top"
                accessible={true}
                accessibilityLabel="Message input"
                accessibilityHint="Type a message to your security agent"
                returnKeyType="send"
                blurOnSubmit={false}
                onSubmitEditing={() => {
                  if (chatInput.trim()) onSendMessage(chatInput.trim());
                }}
              />
              <TouchableOpacity
                style={[
                  styles.chatSendButton,
                  chatInput.trim() && styles.chatSendButtonActive
                ]}
                onPress={() => {
                  if (chatInput.trim()) onSendMessage(chatInput.trim());
                }}
                disabled={!chatInput.trim() || isSending}
                accessible={true}
                accessibilityLabel="Send message"
                accessibilityRole="button"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialIcons
                  name="send"
                  size={20}
                  color={chatInput.trim() ? "#ffffff" : "#bdc3c7"}
                />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

export default ChatBox;
