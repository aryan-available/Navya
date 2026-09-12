/**
 * GridPilot Real-Time WebSocket Channel (Socket.IO)
 * Pushes live digital-twin state ticks, optimization runs, ladder stage changes, and what-if triggers.
 */

import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import {
  CommunityState,
  DispatchPlan,
  LadderResponse,
  SignalState,
  ScenarioResult
} from '../types';

export class LiveStateBroadcaster {
  private io: SocketIOServer | null = null;

  public init(server: HttpServer): SocketIOServer {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: '*', // Allow frontend dev server and community kiosk clients
        methods: ['GET', 'POST']
      }
    });

    // Optional Socket.IO authentication middleware
    this.io.use((socket: Socket, next) => {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
      if (token) {
        try {
          const decoded = jwt.verify(token, env.JWT_SECRET);
          (socket as any).user = decoded;
        } catch (err) {
          logger.debug('Socket connection with invalid token; allowing as guest/kiosk viewer');
        }
      }
      next();
    });

    this.io.on('connection', (socket: Socket) => {
      const user = (socket as any).user;
      logger.info(`WebSocket client connected [ID: ${socket.id}] ${user ? `(User: ${user.email})` : '(Anonymous/Kiosk)'}`);

      socket.on('disconnect', (reason) => {
        logger.info(`WebSocket client disconnected [ID: ${socket.id}, Reason: ${reason}]`);
      });

      // Handle ping
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: new Date().toISOString() });
      });
    });

    logger.info('Socket.IO real-time server initialized');
    return this.io;
  }

  public emitLiveState(state: CommunityState): void {
    if (!this.io) return;
    this.io.emit('live_state_update', state);
  }

  public emitOptimization(dispatch: DispatchPlan): void {
    if (!this.io) return;
    this.io.emit('optimization_update', dispatch);
  }

  public emitLadderUpdate(ladder: LadderResponse): void {
    if (!this.io) return;
    this.io.emit('ladder_stage_changed', ladder);
  }

  public emitSignal(signal: SignalState): void {
    if (!this.io) return;
    this.io.emit('signal_update', signal);
  }

  public emitScenario(result: ScenarioResult): void {
    if (!this.io) return;
    this.io.emit('scenario_injected', result);
  }

  public emitOverride(overrideData: any): void {
    if (!this.io) return;
    this.io.emit('override_changed', overrideData);
  }

  public getIO(): SocketIOServer | null {
    return this.io;
  }
}

export const liveStateBroadcaster = new LiveStateBroadcaster();
