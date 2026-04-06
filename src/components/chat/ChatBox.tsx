import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { styles } from './ChatBox.styles';
 

interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'agent' | 'system';
  senderName?: string | null;
  timestamp: Date;
  messageType?: 'TEXT' | 'SYSTEM' | 'MEDIA';
  systemEvent?:
    | 'AGENT_JOINED'
    | 'AGENT_LEFT'
    | 'AGENT_ASSIGNED'
    | 'AGENT_UNASSIGNED'
    | 'CHAT_RESOLVED'
    | 'CHAT_REOPENED'
    | null;
}

interface ChatBoxProps {
  visible: boolean;
  useModal?: boolean;
  chatMessages: ChatMessage[];
  chatInput: string;
  isTyping: boolean;
  isSending?: boolean;
  isLoading?: boolean;
  isInitiatingCall?: boolean;
  callInitiationLabel?: string | null;
  threadStatus?: 'OPEN' | 'RESOLVED' | 'CLOSED' | null;
  hasAssignedAgent?: boolean;
  agentName?: string | null;
  isResolving?: boolean;
  onClose: () => void;
  onChatInputChange: (text: string) => void;
  onSendMessage: (text?: string) => void;
  onInitiateCall?: (type: 'VIDEO' | 'AUDIO') => void;
  onResolveChat?: () => void;
  formatChatTime: (date: Date) => string;
}

const ChatBox: React.FC<ChatBoxProps> = ({
  visible,
  useModal = true,
  chatMessages,
  chatInput,
  isTyping,
  isSending,
  isLoading,
  isInitiatingCall,
  callInitiationLabel,
  threadStatus,
  hasAssignedAgent,
  agentName,
  isResolving,
  onClose,
  onChatInputChange,
  onSendMessage,
  onInitiateCall,
  onResolveChat,
  formatChatTime,
}) => {
    const handleCallPress = () => {
      if (!onInitiateCall) {
        return;
      }

      Alert.alert('Start call', 'Choose call type', [
        {
          text: 'Audio',
          onPress: () => onInitiateCall('AUDIO'),
        },
        {
          text: 'Video',
          onPress: () => onInitiateCall('VIDEO'),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]);
    };

  const quickResponses = ['I need help', 'Emergency assistance', 'Check my location', 'I\'m safe'];
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);
  const canResolve = threadStatus === 'OPEN' && !!onResolveChat;
  const statusText = threadStatus || 'OPEN';
  const normalizedAgentName = agentName?.trim() || null;
  const headerTitle = isLoading
    ? 'Checkin..'
    : hasAssignedAgent && normalizedAgentName
      ? normalizedAgentName
      : 'Security Agent';
  const headerPresence = hasAssignedAgent ? 'Assigned' : 'Waiting for agent';

  const getSystemEventText = (event?: ChatMessage['systemEvent']): string => {
    if (!event) {
      return 'Chat updated';
    }

    const map: Record<Exclude<ChatMessage['systemEvent'], null | undefined>, string> = {
      AGENT_JOINED: 'Agent joined the chat',
      AGENT_LEFT: 'Agent left the chat',
      AGENT_ASSIGNED: 'Agent assigned',
      AGENT_UNASSIGNED: 'Agent unassigned',
      CHAT_RESOLVED: 'Chat resolved',
      CHAT_REOPENED: 'Chat reopened',
    };

    return map[event] || 'Chat updated';
  };

  const handleQuickResponse = (response: string) => {
    if (isSending) return;
    // Pass text directly to avoid stale-closure race condition
    onSendMessage(response);
  };

  // Scroll to bottom when new messages arrive or typing indicator appears
  useEffect(() => {
    if (visible && (chatMessages.length > 0 || isTyping)) {
      // Snap to bottom immediately to avoid visible jump from top to bottom.
      requestAnimationFrame(() => {
        scrollViewRef.current?.scrollToEnd({ animated: false });
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

  if (!visible) {
    return null;
  }

  const content = (
    <View style={styles.chatContainer}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          {/* Chat Header */}
          <View style={[styles.chatHeader, { paddingTop: insets.top + 10 }]}>
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
                {isLoading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.chatAgentInitials}>SA</Text>
                )}
              </View>
              <View style={styles.chatAgentDetails}>
                <Text style={styles.chatAgentName}>{headerTitle}</Text>
                <View style={styles.chatOnlineStatus}>
                  <View style={styles.chatOnlineDot} />
                  <Text style={styles.chatOnlineText}>{headerPresence}</Text>
                </View>
                {/* <View style={styles.chatThreadStatusBadge}>
                  <Text style={styles.chatThreadStatusText}>Status: {statusText}</Text>
                </View> */}
              </View>
            </View>

            {canResolve && (
              <TouchableOpacity
                style={styles.chatResolveButton}
                onPress={onResolveChat}
                disabled={isResolving}
                accessible={true}
                accessibilityLabel="End chat"
                accessibilityRole="button"
              >
                <Text style={styles.chatResolveButtonText}>
                  {isResolving ? 'Ending...' : 'End chat'}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.chatCallButton}
              onPress={handleCallPress}
              disabled={!onInitiateCall || isLoading || isInitiatingCall}
              accessible={true}
              accessibilityLabel="Call security agent"
              accessibilityRole="button"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {isInitiatingCall ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <MaterialIcons name="phone" size={22} color="#ffffff" />
              )}
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
            onContentSizeChange={() => {
              if (!visible) {
                return;
              }

              requestAnimationFrame(() => {
                scrollViewRef.current?.scrollToEnd({ animated: false });
              });
            }}
          >
            {isLoading && chatMessages.length === 0 && (
              <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#000000" />
              </View>
            )}
              {chatMessages.map((message) => {
              const isSystem = message.sender === 'system' || message.messageType === 'SYSTEM';

              if (isSystem) {
                const systemText = message.text || getSystemEventText(message.systemEvent);
                return (
                  <View
                      key={message.id}
                    style={[styles.chatMessageBubble, styles.chatSystemMessageWrap]}
                  >
                    <View style={styles.chatSystemMessageBubble}>
                      <Text style={styles.chatSystemMessageText}>{systemText}</Text>
                    </View>
                    <Text style={styles.chatSystemMessageTime}>
                      {formatChatTime(message.timestamp)}
                    </Text>
                  </View>
                );
              }

              return (
                <View
                  key={message.id}
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
              );
            })}
            
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

            {isInitiatingCall && (
              <View style={[styles.chatMessageBubble, styles.chatSystemMessageWrap]}>
                <View style={styles.chatCallStartingBubble}>
                  <ActivityIndicator size="small" color="#4DA8DA" />
                  <Text style={styles.chatCallStartingText}>
                    {callInitiationLabel || 'Starting call...'}
                  </Text>
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
                  disabled={!!isSending}
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
                placeholder={threadStatus === 'RESOLVED' || threadStatus === 'CLOSED' ? 'Type to start a new chat...' : 'Type a message...'}
                placeholderTextColor="#bdc3c7"
                value={chatInput}
                onChangeText={onChatInputChange}
                multiline={true}
                maxLength={500}
                textAlignVertical="top"
                editable={true}
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
                disabled={!chatInput.trim() || !!isSending}
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
      </View>
  );

  if (!useModal) {
    return content;
  }

  return (
    <Modal
      animationType="slide"
      transparent={false}
      visible={visible}
      onRequestClose={onClose}
    >
      {content}
    </Modal>
  );
};

export default ChatBox;
