#!/usr/bin/env node
import {CredentialStore, PublicError, models} from './oauth.js';

const [command, connection = 'default', ...extra] = process.argv.slice(2);
try {
  if (!['models', 'logout'].includes(command) || extra.length) throw new PublicError('Usage: cenmax-kilo <models|logout> [connection]');
  const store = new CredentialStore(connection);
  if (command === 'models') for (const model of await models(store)) console.log(`${model.id}\t${model.label}`);
  if (command === 'logout') { await store.logout(); console.log('Cenmax AI disconnected.'); }
} catch (error) { console.error(error instanceof PublicError ? error.message : 'Cenmax AI operation failed.'); process.exitCode = 1; }
