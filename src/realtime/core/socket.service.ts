import { io, Socket } from 'socket.io-client';
import {
  SocketChannel,
  SocketConnectionState,
  SocketTransport,
} from './socket.enums';
import {
  ConnectionStateHandler,
  NotificationEnvelope,
  NotificationHandler,
  SocketStateSnapshot,
} from './socket.types';

class ChatSocketService {
  private socket: Socket | null = null;
  private baseUrl: string | null = null;
  private token: string | null = null;
  private notificationHandlers = new Set<NotificationHandler>();
  private connectionHandlers = new Set<ConnectionStateHandler>();
  private connectCount = 0;

  connect(baseUrl: string, token: string): Socket {
    const shouldReconnect =
      !this.socket ||
      this.baseUrl !== baseUrl ||
      this.token !== token;

    if (!shouldReconnect && this.socket) {
      return this.socket;
    }

    if (this.socket) {
      this.cleanupSocket();
      this.socket.disconnect();
      this.socket = null;
    }

    this.baseUrl = baseUrl;
    this.token = token;

    const socket = io(baseUrl, {
      transports: [SocketTransport.WEBSOCKET],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.socket = socket;
    this.bindCoreListeners(socket);

    return socket;
  }

  disconnect(): void {
    if (!this.socket) {
      return;
    }

    this.cleanupSocket();
    this.socket.disconnect();
    this.socket = null;
  }

  onNotification(handler: NotificationHandler): void {
    this.notificationHandlers.add(handler);
  }

  offNotification(handler: NotificationHandler): void {
    this.notificationHandlers.delete(handler);
  }

  onConnectionStateChange(handler: ConnectionStateHandler): void {
    this.connectionHandlers.add(handler);
  }

  offConnectionStateChange(handler: ConnectionStateHandler): void {
    this.connectionHandlers.delete(handler);
  }

  isConnected(): boolean {
    return !!this.socket?.connected;
  }

  getStateSnapshot(): SocketStateSnapshot {
    return {
      connected: this.isConnected(),
      state: this.isConnected()
        ? SocketConnectionState.CONNECTED
        : SocketConnectionState.DISCONNECTED,
    };
  }

  private bindCoreListeners(socket: Socket): void {
    socket.on(SocketChannel.NOTIFICATION, (payload: NotificationEnvelope) => {
      this.notificationHandlers.forEach((handler) => {
        handler(payload);
      });
    });

    socket.on('connect', () => {
      this.connectCount += 1;
      this.emitConnectionState(SocketConnectionState.CONNECTED);
    });

    socket.on('disconnect', () => {
      this.emitConnectionState(SocketConnectionState.DISCONNECTED);
    });

    socket.on('connect_error', () => {
      this.emitConnectionState(SocketConnectionState.DISCONNECTED);
    });
  }

  private emitConnectionState(state: SocketConnectionState): void {
    this.connectionHandlers.forEach((handler) => {
      handler(state);
    });
  }

  private cleanupSocket(): void {
    if (!this.socket) {
      return;
    }

    this.socket.off(SocketChannel.NOTIFICATION);
    this.socket.off('connect');
    this.socket.off('disconnect');
    this.socket.off('connect_error');
  }
}

export const chatSocketService = new ChatSocketService();
