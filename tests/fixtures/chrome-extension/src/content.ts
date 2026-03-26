import { messaging } from './lib/messaging';

messaging.send({ type: 'content-loaded', url: window.location.href });
