import { loadConfig } from '../src/config.js';
import { formatPingMessage } from '../src/pingMessage.js';

const config = loadConfig();
console.log(formatPingMessage(config));
