// -----------------------------------------------------------------------------
// The container's own refresh timer.
//
// The place devices are published with `should_poll: true` and a one-minute
// `poll_frequency`, but the core cannot be trusted to call onPoll: Gladys
// 5.2.x skips devices created without `should_poll`, and a device keeps the
// polling fields it was created with (GladysAssistant/Gladys#3198). So the
// container refreshes the places by itself, and the core's onPoll stays as a
// fallback.
//
// The timer ticks every few minutes (never more than a period): the current
// hour moves on its own between two reads, so each tick publishes the step of
// now, and reads the API only for what is due — the hourly forecast once per
// period (skipped when read less than half a period ago), the daily one every
// 3 hours. The core's onPoll (every minute) calls the API only for a place not
// read for 90 % of a period. Only the places the user added to Gladys are read.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'poller' });

// The current hour is published at most this late.
const MAX_TICK_MS = 5 * 60000;

/**
 * @param {object} options
 * @param {import('./hub.js').ForecastHub} options.hub
 * @param {boolean} [options.timers] run the periodic timer (tests may turn it off)
 * @param {number} [options.tickMs] override of the tick (tests)
 * @param {() => Promise<void>} [options.onPolled] after a cycle or a poll that read the API
 */
export function createPoller({ hub, timers = true, tickMs, onPolled = async () => {} }) {
  let timer = null;
  let stopped = true;
  const tick = () => tickMs ?? Math.min(MAX_TICK_MS, hub.periodMs());

  /** One cycle: every added place, one after the other. */
  async function cycle() {
    if (hub.gladys.connected === false) {
      logger.debug('Gladys unreachable: cycle skipped');
      return;
    }
    if (!hub.isReady()) {
      return;
    }
    let called = false;
    for (const location of hub.createdLocations()) {
      called = (await hub.poll(location, { minGap: 0.5 })) || called;
    }
    if (called) {
      await onPolled();
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = null;
    if (!timers || stopped) {
      return;
    }
    timer = setTimeout(async () => {
      timer = null;
      try {
        await cycle();
      } catch (err) {
        logger.error(`Refresh cycle failed (${err.message})`);
      } finally {
        schedule();
      }
    }, tick());
    timer.unref?.();
  }

  return {
    cycle,

    /** (Re)start the timer: the first cycle runs one tick from now. */
    start() {
      stopped = false;
      schedule();
    },

    /**
     * The core's onPoll (fallback): publishes the hour of now, and reads the
     * API only when the timer did not for 90 % of a period.
     * @param {{ external_id: string }} device
     */
    async pollFromCore(device) {
      const location = hub.locationByDevice(device.external_id);
      if (!location || !hub.isReady()) {
        logger.debug(`onPoll ignored for ${device.external_id}`);
        return;
      }
      if (await hub.poll(location, { minGap: 0.9 })) {
        await onPolled();
      }
    },

    stop() {
      stopped = true;
      clearTimeout(timer);
      timer = null;
    },
  };
}
