import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ActivityIndicator, View, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AudioCallInterface from '@/components/AudioCallInterface';
import { useAuth } from '@/core/auth';

const AudioCallScreen: React.FC = () => {
  const navigation = useNavigation();
  const auth = useAuth();
  const [generatedCallId, setGeneratedCallId] = useState<string | null>(null);

  const effectiveUserName = useMemo(() => {
    const fromProfile = auth.profile?.name || auth.profile?.email;
    const fromUser = auth.user?.name || auth.user?.email;
    return fromProfile || fromUser || 'User';
  }, [auth.profile, auth.user]);

  useEffect(() => {
    if (!auth.isAuthReady) {
      return;
    }

    const user = auth.user;
    if (!user?.id) {
      Alert.alert('Call Error', 'User not authenticated.');
      navigation.goBack();
      return;
    }

    if (generatedCallId) {
      return;
    }

    const timestamp = Date.now();
    const shortUserId = user.id.substring(0, 8);
    setGeneratedCallId(`audio-${shortUserId}-${timestamp}`);
  }, [auth.isAuthReady, auth.user, generatedCallId, navigation]);

  const callId = generatedCallId;
  const userName = effectiveUserName;

  useEffect(() => {
    if (!auth.isAuthReady) {
      return;
    }
    if (!callId) {
      // Wait for generated callId before showing any fallback error.
      return;
    }
    if (!userName) {
      Alert.alert('Call Error', 'Unable to resolve call user information.');
      navigation.goBack();
    }
  }, [auth.isAuthReady, callId, navigation, userName]);

  const handleCallEnd = () => {
    navigation.goBack();
  };

  const handleCallError = (error: string) => {
    Alert.alert('Call Error', error);
    navigation.goBack();
  };

  if (!auth.isAuthReady || !callId || !userName) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  return (
    <AudioCallInterface
      callId={callId}
      userName={userName}
      onCallEnd={handleCallEnd}
      onCallError={handleCallError}
    />
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
});

export default AudioCallScreen;
