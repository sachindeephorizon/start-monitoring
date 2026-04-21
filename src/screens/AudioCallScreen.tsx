import React, { useEffect, useMemo, useState, Suspense, lazy } from 'react';
import { Alert, ActivityIndicator, View, StyleSheet, Text } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '@/core/auth';
import { hasWebRTCNativeModule } from '@/lib/streamVideoSdkLoader';

const AudioCallInterfaceLazy = lazy(() => import('@/components/AudioCallInterface'));

const AudioCallScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const auth = useAuth();
  const [generatedCallId, setGeneratedCallId] = useState<string | null>(null);
  const routeCallId = typeof route.params?.callId === 'string' ? route.params.callId : null;
  const routeAgentId = typeof route.params?.agentId === 'string' ? route.params.agentId : undefined;

  const effectiveUserName = useMemo(() => {
    const fromProfile = auth.profile?.name || auth.profile?.email;
    const fromUser = auth.user?.name || auth.user?.email;
    return fromProfile || fromUser || 'User';
  }, [auth.profile, auth.user]);

  useEffect(() => {
    if (!auth.isAuthReady) {
      return;
    }

    if (!hasWebRTCNativeModule) {
      Alert.alert(
        'WebRTC Not Available',
        'Audio calling is unavailable in this build. Please install a development/production build with native modules.',
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
      return;
    }

    const user = auth.user;
    if (!user?.id) {
      Alert.alert('Call Error', 'User not authenticated.');
      navigation.goBack();
      return;
    }

    if (routeCallId || generatedCallId) {
      return;
    }

    const timestamp = Date.now();
    const shortUserId = user.id.substring(0, 8);
    setGeneratedCallId(`audio-${shortUserId}-${timestamp}`);
  }, [auth.isAuthReady, auth.user, generatedCallId, navigation, routeCallId]);

  const callId = routeCallId || generatedCallId;
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

  if (!hasWebRTCNativeModule) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.fallbackText}>WebRTC native module not found in this build.</Text>
      </View>
    );
  }

  return (
    <Suspense
      fallback={
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
        </View>
      }
    >
      <AudioCallInterfaceLazy
        callId={callId}
        userName={userName}
        agentId={routeAgentId}
        onCallEnd={handleCallEnd}
        onCallError={handleCallError}
      />
    </Suspense>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  fallbackText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});

export default AudioCallScreen;
