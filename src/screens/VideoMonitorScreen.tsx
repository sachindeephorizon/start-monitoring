import React, { useState, Suspense, useEffect, useCallback } from 'react';
import {
	View,
	Text,
	Alert,
	ActivityIndicator,
	TouchableOpacity,
	StyleSheet,
	Platform,
	Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Camera } from 'expo-camera';
import StreamVideoCallDedicated from '@/components/StreamVideoCallDedicated';
import AudioCallScreen from '@/screens/AudioCallScreen';
import { useAuth } from '@/core/auth';
import { simpleCallService, SimpleCallSession } from '@/services/simpleCall.service';
import { setCallPriorityActive } from '@/services/callPriority';
import { Service } from '@/types/services';
import { styles as videoMonitorStyles } from '@/components/modals/VideoMonitorModal.styles';

const VideoMonitorScreen: React.FC = () => {
	const navigation = useNavigation();
	const auth = useAuth();
	const [activeService, setActiveService] = useState<string | null>(Service.VIDEO);
	const [isStartingCall, setIsStartingCall] = useState(false);
	const [cameraPermission, setCameraPermission] = useState(false);

	const [isMonitoring, setIsMonitoring] = useState(false);
	const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('front');
	const [isMuted, setIsMuted] = useState(false);
	const [isVideoEnabled, setIsVideoEnabled] = useState(true);

	const [showCall, setShowCall] = useState(false);
	const [callSession, setCallSession] = useState<SimpleCallSession | null>(null);
	const [isAudioCall, setIsAudioCall] = useState(false);
	const [isRequestingPermissions, setIsRequestingPermissions] = useState(false);

	const startCall = useCallback(async (callType: 'video' | 'audio', reason: string) => {
		try {
			setIsStartingCall(true);
			setCallPriorityActive(true);

			// ensureValidSession() already refreshes expired tokens
			const user = auth.user;

			if(!user){
				throw new Error('User not authenticated');
			}
			if (__DEV__) console.log('[HomeScreen] ✅ Session valid, user ID:', user.id);


			const userName = user?.name || user.email || 'User';

			if (callType === 'audio') {
				// Use dedicated audio call service for audio calls
				const { audioCallService } = await import('@/services/audioCall.service');

				// Initialize user
				await audioCallService.initializeUser(user.id, userName);

				// Generate call ID (similar to video calls)
				const timestamp = Date.now();
				const shortUserId = user.id.substring(0, 8);
				const callId = `audio-${shortUserId}-${timestamp}`;

				// Create session object for UI
				const session: SimpleCallSession = {
					id: callId,
					callType: 'audio',
					roomCode: callId,
					userName: userName,
					status: 'active',
					createdAt: new Date().toISOString(),
				};

				setCallSession(session);
				setIsAudioCall(true);
				setShowCall(true);
				setActiveService(null);
				setIsMonitoring(false);

				console.log('[HomeScreen] Audio call started:', callId);
			} else {
				// Use simpleCallService for video calls
				const session = await simpleCallService.createCallSession({
					callType,
					userName,
					reason,
					priority: reason.includes('Emergency') ? 'emergency' : 'medium',
				});

				await simpleCallService.startCall(session);

				setCallSession(session);
				setIsAudioCall(false);
				setShowCall(true);
				setActiveService(null);
				setIsMonitoring(true);

				console.log('[HomeScreen] Video call started:', session.roomCode);
			}
		} catch (error: any) {
			console.error('[HomeScreen] ❌ Failed to start call:', error);
			console.error('[HomeScreen] Error details:', {
				message: error?.message,
				name: error?.name,
				stack: error?.stack,
			});
			Alert.alert(
				'Call Error',
				`Failed to start ${callType} call: ${error?.message || 'Unknown error'}\n\nPlease try again or contact support.`,
				[{ text: 'OK' }]
			);
		} finally {
			setIsStartingCall(false);
			setCallPriorityActive(false); // Reset priority flag on error too
		}
	}, [auth.user]);

	React.useEffect(() => {
		const checkPermission = async () => {
			try {
				const { status } = await Camera.getCameraPermissionsAsync();
				setCameraPermission(status === 'granted');
			} catch (error) {
				console.error('Error checking camera permission:', error);
			}
		};
		checkPermission();
	}, []);

	const handleRequestPermissions = async () => {
		if (isRequestingPermissions) return;

		setIsRequestingPermissions(true);
		try {
			const cameraResult = await Camera.requestCameraPermissionsAsync();
			const micResult = await Camera.requestMicrophonePermissionsAsync();

			const cameraGranted = cameraResult.status === 'granted';
			const micGranted = micResult.status === 'granted';

			if (cameraGranted && micGranted) {
				setCameraPermission(true);
				handleStartMonitoring();
			} else {
				Alert.alert(
					'Permissions Required',
					'Camera and microphone permissions are required for video monitoring. Please grant these permissions in your device settings.',
					[
						{ text: 'Cancel', style: 'cancel' },
						{
							text: 'Open Settings',
							onPress: () => {
								if (Platform.OS === 'ios') {
									Linking.openURL('app-settings:');
								} else {
									Linking.openSettings();
								}
							}
						}
					]
				);
			}
		} catch (error) {
			console.error('[VideoMonitorScreen] Permission request error:', error);
			Alert.alert(
				'Permission Error',
				'Failed to request camera and microphone permissions. Please try again or grant permissions manually in settings.',
				[{ text: 'OK' }]
			);
		} finally {
			setIsRequestingPermissions(false);
		}
	};

	const handleStartMonitoring = async () => {
		try {
			// Check camera permission
			if (!cameraPermission) {
				const { status } = await Camera.requestCameraPermissionsAsync();
				if (status !== 'granted') {
					Alert.alert(
						'Camera Permission Required',
						'Please grant camera permission to start video monitoring.',
						[{ text: 'OK' }]
					);
					return;
				}
				setCameraPermission(true);
			}

			// Start video call
			await startCall('video', 'Video monitoring session');
		} catch (error) {
			console.error('[HomeScreen] Error starting monitoring:', error);
			Alert.alert('Error', 'Failed to start video monitoring');
		}
	};

	const handleEndVideoSession = async () => {
		if (callSession) {
			if (isAudioCall) {
				// End audio call
				const { audioCallService } = await import('@/services/audioCall.service');
				await audioCallService.endCall();
			} else {
				// End video call
				await simpleCallService.endCall(callSession.id);
			}
		}
		setShowCall(false);
		setCallSession(null);
		setIsAudioCall(false);
		setIsMonitoring(false);
		setCallPriorityActive(false);
	};

	const handleCallEnd = () => {
		handleEndVideoSession();
	};

	const handleCallError = (error: string) => {
		console.error('[HomeScreen] Call error:', error);
		Alert.alert('Call Error', error);
		handleEndVideoSession();
	};

	const handleClose = useCallback(() => {
		setActiveService(null);
		navigation.goBack();
	}, [navigation]);

	useEffect(() => {
		if (!showCall && !isMonitoring && activeService === null) {
			navigation.goBack();
		}
	}, [activeService, isMonitoring, navigation, showCall]);

	return (
		<SafeAreaView style={styles.container} edges={['top', 'bottom']}>
			{showCall && callSession && isAudioCall ? (
				<View style={styles.callContainer}>
					<AudioCallScreen />
				</View>
			) : showCall && callSession && !isAudioCall ? (
				<View style={styles.callContainer}>
					<Suspense fallback={
						<View style={styles.callFallback}>
							<ActivityIndicator size="large" color="#ffffff" />
							<Text style={styles.callFallbackText}>Loading call interface...</Text>
						</View>
					}>
						<StreamVideoCallDedicated
							callId={callSession.roomCode}
							userName={callSession.userName}
							onCallEnd={handleCallEnd}
							onCallError={handleCallError}
						/>
					</Suspense>
				</View>
			) : (
				<View style={styles.contentContainer}>
					<View style={styles.header}>
						<TouchableOpacity
							onPress={handleClose}
							style={styles.backButton}
							activeOpacity={0.7}
							accessibilityRole="button"
							accessibilityLabel="Go back"
						>
							<MaterialIcons name="arrow-back" size={24} color="#2C3E50" />
						</TouchableOpacity>
						<Text style={styles.headerTitle}>Video Monitoring Service</Text>
						<View style={styles.headerSpacer} />
					</View>

					<View style={styles.card}>
						<View style={videoMonitorStyles.serviceContent}>
							<MaterialIcons name="videocam" size={48} color="#2C3E50" style={videoMonitorStyles.serviceIcon} />

							<Text style={videoMonitorStyles.serviceDescription}>
								Activate video monitoring to allow our security agents to access your camera and monitor your surroundings in real-time.
							</Text>

							{!cameraPermission && (
								<View style={videoMonitorStyles.permissionWarning}>
									<MaterialIcons name="warning" size={20} color="#F39C12" />
									<Text style={videoMonitorStyles.permissionText}>Camera permission required</Text>
								</View>
							)}

							<View style={videoMonitorStyles.statusContainer}>
								<Text style={videoMonitorStyles.statusLabel}>Monitoring Status:</Text>
								<Text style={[videoMonitorStyles.statusText, isMonitoring ? videoMonitorStyles.activeStatus : videoMonitorStyles.inactiveStatus]}>
									{isMonitoring ? 'ACTIVE' : 'INACTIVE'}
								</Text>
							</View>

							<TouchableOpacity
								style={[
									videoMonitorStyles.actionButton,
									videoMonitorStyles.startButton,
									(isStartingCall || isRequestingPermissions) && styles.actionButtonDisabled,
								]}
								onPress={async () => {
									if (cameraPermission) {
										await handleStartMonitoring();
										return;
									}
									await handleRequestPermissions();
								}}
								disabled={isStartingCall || isRequestingPermissions}
							>
								{isStartingCall || isRequestingPermissions ? (
									<ActivityIndicator color="#ffffff" />
								) : (
									<Text style={videoMonitorStyles.actionButtonText}>Start Monitoring</Text>
								)}
							</TouchableOpacity>

							<Text style={videoMonitorStyles.serviceNote}>
								Note: You can end the monitoring session at any time. Your privacy and security are our top priorities.
							</Text>
						</View>
					</View>
				</View>
			)}
		</SafeAreaView>
	);
};

export default VideoMonitorScreen;

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#ffffff',
	},
	contentContainer: {
		flex: 1,
		// paddingHorizontal: 20,
		// paddingTop: 12,
		// paddingBottom: 24,
	},
	header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '500',
    color: '#2C3E50',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 32,
  },
	card: {
		// // backgroundColor: '#ffffff',
		// // borderRadius: 20,
		// paddingHorizontal: 16,
		// paddingVertical: 24,
		// // shadowColor: '#000',
		// shadowOffset: { width: 0, height: 8 },
		// shadowOpacity: 0.08,
		// shadowRadius: 18,
		// elevation: 4,
		marginTop: 12,
	},
	actionButtonDisabled: {
		opacity: 0.7,
	},
	callContainer: {
		flex: 1,
		backgroundColor: '#0B132B',
	},
	callFallback: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		backgroundColor: '#0B132B',
	},
	callFallbackText: {
		color: '#ffffff',
		marginTop: 16,
	},
});
