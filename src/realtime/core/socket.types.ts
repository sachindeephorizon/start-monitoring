import { SocketConnectionState } from './socket.enums';

export interface NotificationEnvelope<T = unknown> {
  event: string;
  data: T;
}

export type NotificationHandler<T = unknown> = (
  payload: NotificationEnvelope<T>,
) => void;

export type ConnectionStateHandler = (state: SocketConnectionState) => void;

export interface SocketStateSnapshot {
  connected: boolean;
  state: SocketConnectionState;
}
