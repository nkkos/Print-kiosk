import { readFile, writeFile } from 'node:fs/promises';
import mqtt from 'mqtt';
import type { DoorState, LockState } from '../server/pavilionDoor.js';

// The entrance lock as the agent sees it (docs/pavilion-security-requirements.md,
// section 1: Nuki Smart Lock Pro on the door's key cylinder, no keypad).
//
//   DOOR_LOCK=none            (default) no door control — the agent only prints
//   DOOR_LOCK=simulated       a JSON file stands in for the lock:
//                             DOOR_SIMULATOR_FILE (default door-simulator.json),
//                             {"lock":"locked","door":"closed","reachable":true,
//                              "batteryCritical":false} — read on every poll, so
//                             editing "door" by hand simulates someone opening it;
//                             lock()/unlock() write "lock" back.
//   DOOR_LOCK=nuki-mqtt       a real Nuki over its local MQTT API: the lock
//                             connects to a broker on the mini-PC (Mosquitto),
//                             so nothing goes through Nuki's cloud.
//                             NUKI_MQTT_URL (default mqtt://127.0.0.1:1883),
//                             NUKI_MQTT_USERNAME / NUKI_MQTT_PASSWORD,
//                             NUKI_DEVICE_ID — the hex id in the lock's topics
//                             (nuki/<id>/...), shown by the Nuki app.

export interface DoorReading {
  lock: LockState;
  door: DoorState;
  reachable: boolean;
  batteryCritical: boolean;
}

export interface DoorLock {
  name: string;
  read(): Promise<DoorReading>;
  lock(): Promise<void>;
  unlock(): Promise<void>;
}

export function createDoorLock(): DoorLock | null {
  const kind = process.env.DOOR_LOCK ?? 'none';
  if (kind === 'simulated')
    return simulatedLock(process.env.DOOR_SIMULATOR_FILE || 'door-simulator.json');
  if (kind === 'nuki-mqtt') {
    const deviceId = process.env.NUKI_DEVICE_ID;
    if (!deviceId) throw new Error('DOOR_LOCK=nuki-mqtt needs NUKI_DEVICE_ID');
    return nukiMqttLock(process.env.NUKI_MQTT_URL || 'mqtt://127.0.0.1:1883', deviceId);
  }
  if (kind !== 'none') throw new Error(`Unknown DOOR_LOCK "${kind}"`);
  return null;
}

function simulatedLock(file: string): DoorLock {
  const initial: DoorReading = {
    lock: 'locked',
    door: 'closed',
    reachable: true,
    batteryCritical: false,
  };
  async function load(): Promise<DoorReading> {
    try {
      return { ...initial, ...(JSON.parse(await readFile(file, 'utf8')) as Partial<DoorReading>) };
    } catch {
      await writeFile(file, JSON.stringify(initial, null, 2));
      return initial;
    }
  }
  async function setLock(lock: LockState) {
    const reading = await load();
    if (!reading.reachable) throw new Error('simulated lock unreachable');
    await writeFile(file, JSON.stringify({ ...reading, lock }, null, 2));
  }
  return {
    name: `simulated (${file})`,
    read: load,
    lock: () => setLock('locked'),
    unlock: () => setLock('unlocked'),
  };
}

// Nuki MQTT API values (developer.nuki.io, "MQTT API"). Checked against the
// documentation, not yet against the real lock — verify on first install.
//   nuki/<id>/state            lock state: 1 locked, 2 unlocking, 3 unlocked,
//                              4 locking, 5 unlatched, 6 unlocked (lock 'n' go),
//                              7 unlatching, 254 motor blocked, 0/255 unknown
//   nuki/<id>/doorsensorState  2 door closed, 3 door opened, others unknown
//   nuki/<id>/batteryCritical  "true" / "false"
//   nuki/<id>/connected        "true" / "false" — the lock's own MQTT session
//   nuki/<id>/lockAction       publish 1 = unlock, 2 = lock
const LOCK_ACTION = { unlock: '1', lock: '2' } as const;

function lockStateFromNuki(value: string): LockState {
  switch (value) {
    case '1':
      return 'locked';
    case '3':
    case '5':
    case '6':
      return 'unlocked';
    case '2':
    case '4':
    case '7':
      return 'moving';
    default:
      return 'unknown';
  }
}

function doorStateFromNuki(value: string): DoorState {
  if (value === '2') return 'closed';
  if (value === '3') return 'open';
  return 'unknown';
}

function nukiMqttLock(url: string, deviceId: string): DoorLock {
  const prefix = `nuki/${deviceId}`;
  const client = mqtt.connect(url, {
    username: process.env.NUKI_MQTT_USERNAME || undefined,
    password: process.env.NUKI_MQTT_PASSWORD || undefined,
    reconnectPeriod: 5000,
  });
  const latest = { state: '', door: '', battery: '', connected: '' };
  client.on('connect', () => {
    client.subscribe(
      ['state', 'doorsensorState', 'batteryCritical', 'connected'].map((t) => `${prefix}/${t}`),
    );
  });
  client.on('error', (err) => console.error('[door] MQTT error:', err.message));
  client.on('message', (topic, payload) => {
    const value = payload.toString().trim();
    if (topic === `${prefix}/state`) latest.state = value;
    else if (topic === `${prefix}/doorsensorState`) latest.door = value;
    else if (topic === `${prefix}/batteryCritical`) latest.battery = value;
    else if (topic === `${prefix}/connected`) latest.connected = value;
  });

  function publish(action: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!client.connected) {
        reject(new Error('MQTT broker not connected'));
        return;
      }
      client.publish(`${prefix}/lockAction`, action, { qos: 1 }, (err) =>
        err ? reject(err) : resolve(),
      );
    });
  }

  return {
    name: `Nuki over MQTT (${url}, ${prefix})`,
    async read() {
      return {
        lock: lockStateFromNuki(latest.state),
        door: doorStateFromNuki(latest.door),
        reachable: client.connected && latest.connected !== 'false' && latest.state !== '',
        batteryCritical: latest.battery === 'true',
      };
    },
    lock: () => publish(LOCK_ACTION.lock),
    unlock: () => publish(LOCK_ACTION.unlock),
  };
}
