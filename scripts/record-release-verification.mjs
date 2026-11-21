import { recordVerification } from './release-core.mjs';
try { console.log(JSON.stringify(recordVerification(),null,2)); }
catch(error) { console.error(error.message);process.exitCode=1; }
