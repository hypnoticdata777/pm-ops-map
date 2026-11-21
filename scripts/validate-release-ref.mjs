import fs from 'node:fs';
import { validateSource } from './release-core.mjs';
try {
  const tag=process.env.RELEASE_TAG || '';
  const source=validateSource(undefined,tag);
  if(process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT,`tag=${tag}\nsource_commit=${source.sourceCommit}\n`);
  console.log(`Validated source ${source.sourceCommit}${tag ? ` for ${tag}` : ' (candidate only)'}`);
} catch(error) { console.error(error.message);process.exitCode=1; }
