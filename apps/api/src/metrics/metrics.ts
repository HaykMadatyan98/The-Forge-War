/** Lightweight structured metrics for ops / log drains. */

export type MetricEvent =
  | 'auth_fail'
  | 'auth_ok'
  | 'ws_disconnect'
  | 'ws_disconnect_stale'
  | 'ws_connect'
  | 'ws_auth_fail'
  | 'pvp_result_rejected'
  | 'live_pvp_queued'
  | 'live_pvp_matched'
  | 'live_pvp_finished'
  | 'live_pvp_queue_rejected'
  | 'live_pvp_disconnect'
  | 'live_pvp_action_rejected'
  | 'live_pvp_rejoin'
  | 'live_pvp_rematch_offer'
  | 'save_conflict';

export function logMetric(event: MetricEvent, data: Record<string, unknown> = {}) {
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      type: 'metric',
      event,
      ts: new Date().toISOString(),
      ...data,
    }),
  );
}
