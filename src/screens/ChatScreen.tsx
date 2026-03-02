/**
 * Chat Screen
 * 
 * Dedicated screen for chat when opened from push notifications.
 * This screen is used for deep linking from chat notifications.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { MainStackParamList } from '@/navigation/MainNavigator';
import { useChat } from '@/features/chat/chat.hooks';
import { formatChatTime } from '@/utils/chat';

type ChatScreenRouteProp = RouteProp<MainStackParamList, 'Chat'>;

export default function ChatScreen() {
  const route = useRoute<ChatScreenRouteProp>();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { chatRequestId } = route.params || {};
  
  const { loading, chatRequest, messages, error, sendMessage } = useChat(chatRequestId || null);
  const [chatInput, setChatInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const quickResponses = ['I need help', 'Emergency assistance', 'Check my location', 'I\'m safe'];

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      requestAnimationFrame(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      });
    }
  }, [messages.length]);

  // Scroll to bottom when keyboard opens
  useEffect(() => {
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
  }, []);

  // Handle send message
  const handleSendMessage = async () => {
    if (!chatInput.trim() || !chatRequestId || isSending) {
      return;
    }

    const content = chatInput.trim();
    setIsSending(true);
    setChatInput('');

    const success = await sendMessage(content);
    if (!success) {
      Alert.alert('Error', 'Failed to send message. Please try again.');
      setChatInput(content); // Restore input on error
    }
    setIsSending(false);
  };

  // Handle quick response
  const handleQuickResponse = async (response: string) => {
    if (!chatRequestId || isSending) return;

    const content = response.trim();
    setIsSending(true);
    setChatInput(''); // Clear input

    const success = await sendMessage(content);
    if (!success) {
      Alert.alert('Error', 'Failed to send message. Please try again.');
      setChatInput(content); // Restore input on error
    }
    setIsSending(false);
  };

  if (!chatRequestId) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <MaterialIcons name="error-outline" size={64} color="#CC0022" />
          <Text style={styles.errorTitle}>Error</Text>
          <Text style={styles.errorText}>No chat ID provided</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading && !chatRequest) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4BA8FF" />
          <Text style={styles.loadingText}>Loading chat...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && !chatRequest) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <MaterialIcons name="error-outline" size={64} color="#CC0022" />
          <Text style={styles.errorTitle}>Error</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const agentName = chatRequest?.assigned_agent_id 
    ? 'Security Agent' 
    : 'Waiting for agent assignment...';
  const isOnline = chatRequest?.status === 'active' || chatRequest?.status === 'assigned';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            Keyboard.dismiss();
            navigation.goBack();
          }}
        >
          <MaterialIcons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        
        <View style={styles.agentInfo}>
          <View style={styles.agentAvatar}>
            <Text style={styles.agentInitials}>SA</Text>
          </View>
          <View style={styles.agentDetails}>
            <Text style={styles.agentName}>{agentName}</Text>
            {isOnline && (
              <View style={styles.onlineStatus}>
                <View style={styles.onlineDot} />
                <Text style={styles.onlineText}>Online</Text>
              </View>
            )}
          </View>
        </View>
        
        <TouchableOpacity style={styles.callButton}>
          <MaterialIcons name="phone" size={22} color="#ffffff" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Messages */}
        <ScrollView 
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {messages.map((message, idx) => (
            <View 
              key={`${message.id}-${idx}`} 
              style={[
                styles.messageBubble,
                message.sender === 'user' ? styles.userMessage : styles.agentMessage
              ]}
            >
              <Text style={[
                styles.messageText,
                message.sender === 'user' ? styles.userMessageText : styles.agentMessageText
              ]}>
                {message.body || ''}
              </Text>
              <Text style={[
                styles.messageTime,
                message.sender === 'user' ? styles.userMessageTime : styles.agentMessageTime
              ]}>
                {message.created_at 
                  ? formatChatTime(new Date(message.created_at))
                  : 'Just now'}
              </Text>
            </View>
          ))}
        </ScrollView>

        {/* Quick Response Buttons */}
        <View style={styles.quickResponses}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickResponsesContent}
          >
            {quickResponses.map((response) => (
              <TouchableOpacity
                key={response}
                style={styles.quickResponseButton}
                onPress={() => handleQuickResponse(response)}
              >
                <Text style={styles.quickResponseText}>{response}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Input */}
        <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="Type a message..."
              placeholderTextColor="#bdc3c7"
              value={chatInput}
              onChangeText={setChatInput}
              multiline={true}
              maxLength={500}
              textAlignVertical="top"
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                chatInput.trim() && !isSending && styles.sendButtonActive
              ]}
              onPress={handleSendMessage}
              disabled={!chatInput.trim() || isSending}
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B132B',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#ffffff',
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    color: '#bdc3c7',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: '#4BA8FF',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1a1a2e',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3e',
  },
  agentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginLeft: 12,
  },
  agentAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4BA8FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  agentInitials: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  agentDetails: {
    flex: 1,
  },
  agentName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  onlineStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#27AE60',
    marginRight: 6,
  },
  onlineText: {
    color: '#bdc3c7',
    fontSize: 12,
  },
  callButton: {
    padding: 8,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
  },
  messageBubble: {
    maxWidth: '75%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 12,
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#4BA8FF',
  },
  agentMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#2a2a3e',
  },
  messageText: {
    fontSize: 16,
    marginBottom: 4,
  },
  userMessageText: {
    color: '#ffffff',
  },
  agentMessageText: {
    color: '#ffffff',
  },
  messageTime: {
    fontSize: 12,
    marginTop: 4,
  },
  userMessageTime: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  agentMessageTime: {
    color: '#bdc3c7',
  },
  quickResponses: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#2a2a3e',
  },
  quickResponsesContent: {
    paddingHorizontal: 16,
  },
  quickResponseButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#2a2a3e',
    marginRight: 8,
  },
  quickResponseText: {
    color: '#ffffff',
    fontSize: 14,
  },
  inputContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: '#1a1a2e',
    borderTopWidth: 1,
    borderTopColor: '#2a2a3e',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#2a2a3e',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  input: {
    flex: 1,
    color: '#ffffff',
    fontSize: 16,
    maxHeight: 100,
    paddingVertical: 8,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2a2a3e',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  sendButtonActive: {
    backgroundColor: '#4BA8FF',
  },
});

