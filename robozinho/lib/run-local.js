import 'dotenv/config';
import { runSync } from './run-sync.js';

runSync()
  .then(r => { console.log('Resultado:', r); process.exit(0); })
  .catch(e => { console.error('Erro:', e); process.exit(1); });
