import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import ChatBox from '@/components/chat/ChatBox';
import { useChat } from '@/hooks/useChat';
import { formatChatTime } from '@/utils/chat';
import { clearPendingNotificationNav } from '@/core/notifications/notification.router';

export default function ChatScreen() {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const routeThreadId = typeof route.params?.threadId === 'string'
    ? route.params.threadId
    : typeof route.params?.chatRequestId === 'string'
      ? route.params.chatRequestId
      : undefined;
  const chat = useChat({ initialThreadId: routeThreadId });
  const [chatInput, setChatInput] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [isResolvingChat, setIsResolvingChat] = useState(false);
  const [isInitiatingCall, setIsInitiatingCall] = useState(false);
  const [callInitiationLabel, setCallInitiationLabel] = useState<string | null>(null);
  const isCallInitiationInFlightRef = useRef(false);

  useEffect(() => {
    // Consume/clear pending notification intent once Chat is mounted.
    // Without this, HomeScreen can later consume the stale pending intent
    // and navigate back to Chat again, causing duplicate modal-like opens.
    clearPendingNotificationNav('ChatScreen mounted');

    const unsubscribe = (navigation as any).addListener('focus', () => {
      setIsInitiatingCall(false);
      setCallInitiationLabel(null);
      isCallInitiationInFlightRef.current = false;
    });

    return unsubscribe;
  }, [navigation]);

  const handleClose = useCallback(() => {
    (navigation as any).navigate('Home');
  }, [navigation]);

  const handleSendMessage = useCallback(async (text?: string) => {
    const content = (text || chatInput).trim();
    if (!content || isSendingChat) {
      return;
    }

    setIsSendingChat(true);
    setChatInput('');

    try {
      await chat.sendMessage(content);
    } catch (error) {
      console.error('[ChatScreen] Error sending message:', error);
      Alert.alert('Error', 'Unable to send message, try again');
      setChatInput(content);
    } finally {
      setIsSendingChat(false);
    }
  }, [chatInput, chat.sendMessage, isSendingChat]);

  const handleResolveChat = useCallback(async () => {
    if (isResolvingChat || chat.threadStatus !== 'OPEN') {
      return;
    }

    Alert.alert(
      'End chat',
      'Are you sure you want to end this chat?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'End chat',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsResolvingChat(true);
              await chat.resolveActiveThread();
            } catch (error) {
              console.error('[ChatScreen] Error resolving chat:', error);
              Alert.alert('Error', 'Unable to resolve chat. Please try again.');
            } finally {
              setIsResolvingChat(false);
            }
          },
        },
      ]
    );
  }, [chat.resolveActiveThread, chat.threadStatus, isResolvingChat]);

  const handleInitiateCall = useCallback(async (type: 'VIDEO' | 'AUDIO') => {
    if (isCallInitiationInFlightRef.current) {
      return;
    }

    isCallInitiationInFlightRef.current = true;

    if (!chat.activeAgentId) {
      Alert.alert('No agent assigned', 'Please wait until an agent is assigned before starting a call.');
      setIsInitiatingCall(false);
      setCallInitiationLabel(null);
      isCallInitiationInFlightRef.current = false;
      return;
    }

    const callTypeLabel = type === 'VIDEO' ? 'Video' : 'Audio';
    setCallInitiationLabel(`Starting ${callTypeLabel.toLowerCase()} call...`);
    setIsInitiatingCall(true);
    const callId = `${type.toLowerCase()}-${Date.now()}`;

    try {
      await chat.sendSystemMessage(`${callTypeLabel} call initiated`);
    } catch (error) {
      console.error('[ChatScreen] Failed to send call initiation system message:', error);
      // Do not block call start if system-message post fails.
    }

    if (type === 'VIDEO') {
      (navigation as any).navigate('VideoMonitor', {
        autoStart: true,
        callId,
        agentId: chat.activeAgentId,
      });
      isCallInitiationInFlightRef.current = false;
      return;
    }

    (navigation as any).navigate('AudioCall', {
      callId,
      agentId: chat.activeAgentId,
    });
    isCallInitiationInFlightRef.current = false;
  }, [chat.activeAgentId, chat.sendSystemMessage, navigation]);

  return (
    <ChatBox
      visible={true}
      useModal={false}
      chatMessages={chat.messages}
      chatInput={chatInput}
      isTyping={chat.isTyping}
      isLoading={chat.loading}
      isInitiatingCall={isInitiatingCall}
      callInitiationLabel={callInitiationLabel}
      isSending={isSendingChat || chat.loading}
      threadStatus={chat.threadStatus}
      hasAssignedAgent={chat.hasAssignedAgent}
      agentName={chat.agentName}
      isResolving={isResolvingChat}
      onClose={handleClose}
      onChatInputChange={setChatInput}
      onSendMessage={handleSendMessage}
      onInitiateCall={handleInitiateCall}
      onResolveChat={handleResolveChat}
      formatChatTime={formatChatTime}
    />
  );
}
