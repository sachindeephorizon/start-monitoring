import React from 'react';
import { EmergencyPasskeyModal } from '@/components/modals/EmergencyPasskeyModal';
import { useCheckIn } from '@/hooks/useCheckIn';

export default function CheckInPasskeyHost() {
  const checkIn = useCheckIn({ enableDueWatcher: true });

  return (
    <EmergencyPasskeyModal
      visible={checkIn.showPasskeyModal}
      onSubmit={checkIn.handlePasskeySubmit}
      title="Security Check-In"
      subtitle="Enter passkey to verify"
      icon="security"
      iconColor="#2c3e50"
      isEmergency={false}
      emergencyCountdown={checkIn.passkeyCountdown}
      emergencyDeadlineMs={checkIn.activeCheckIn ? new Date(checkIn.activeCheckIn.scheduledAt).getTime() + 30 * 1000 : undefined}
      enteredPasskey={checkIn.enteredPasskey}
      onPasskeyChange={checkIn.setEnteredPasskey}
      isLoading={checkIn.isPasskeyProcessing}
    />
  );
}
