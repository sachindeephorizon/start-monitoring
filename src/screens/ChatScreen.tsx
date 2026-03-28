import React, { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import ChatBox from '@/components/chat/ChatBox';
import { useChat } from '@/hooks/useChat';
import { formatChatTime } from '@/utils/chat';

export default function ChatScreen() {
  const navigation = useNavigation();
  const chat = useChat();
  const [chatInput, setChatInput] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [isResolvingChat, setIsResolvingChat] = useState(false);

  const handleClose = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleSendMessage = useCallback(async (text?: string) => {
    if (chat.threadStatus === 'RESOLVED' || chat.threadStatus === 'CLOSED') {
      return;
    }

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
  }, [chat.threadStatus, chatInput, chat.sendMessage, isSendingChat]);

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

  const isChatDisabled = chat.threadStatus === 'RESOLVED' || chat.threadStatus === 'CLOSED';

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
      onSendMessage={isChatDisabled ? () => {} : handleSendMessage}
      onResolveChat={handleResolveChat}
      formatChatTime={formatChatTime}
    />
  );
}
