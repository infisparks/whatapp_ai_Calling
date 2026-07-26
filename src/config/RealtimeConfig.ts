/**
 * Realtime Voice Performance & System Boundaries Configuration
 */
export interface RealtimeConfiguration {
  /** Maximum acceptable end-to-end latency target in milliseconds */
  targetLatencyMs: number;
  /** Maximum concurrent live audio calls supported */
  maxConcurrentCalls: number;
  /** WebSocket ping/pong heartbeat interval in milliseconds */
  heartbeatIntervalMs: number;
  /** Silence pause duration in ms to consider caller turn completed */
  turnSilenceTimeoutMs: number;
  /** Max allowed audio response duration from agent in seconds */
  maxResponseDurationSec: number;
  /** Expected average response duration from agent in seconds */
  averageResponseDurationSec: number;
}

export const realtimeConfig: RealtimeConfiguration = {
  targetLatencyMs: 500,
  maxConcurrentCalls: 100,
  heartbeatIntervalMs: 15000,
  turnSilenceTimeoutMs: 500,
  maxResponseDurationSec: 15,
  averageResponseDurationSec: 4,
};
