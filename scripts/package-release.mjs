import { parseArgs } from 'node:util';
import { packageRelease } from './release-core.mjs';
const {values}=parseArgs({options:{tag:{type:'string'}}});
try { const result=packageRelease({tag:values.tag || ''});console.log(`Packaged ${result.name}\nSHA-256: ${result.digest}\nSource dirty: ${result.metadata.sourceDirty}`); }
catch(error) { console.error(error.message);process.exitCode=1; }
