import React, { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import ChatBox from '@/components/chat/ChatBox';
import { useChat } from '@/hooks/useChat';
import { formatChatTime } from '@/utils/chat';

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

  const handleClose = useCallback(() => {
    navigation.goBack();
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

  return (
    <ChatBox
      visible={true}
      chatMessages={chat.messages}
      chatInput={chatInput}
      isTyping={chat.isTyping}
      isSending={isSendingChat || chat.loading}
      threadStatus={chat.threadStatus}
      hasAssignedAgent={chat.hasAssignedAgent}
      isResolving={isResolvingChat}
      onClose={handleClose}
      onChatInputChange={setChatInput}
      onSendMessage={handleSendMessage}
      onResolveChat={handleResolveChat}
      formatChatTime={formatChatTime}
    />
  );
}
