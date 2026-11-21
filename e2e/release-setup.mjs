import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { verifyRelease } from '../scripts/release-core.mjs';
export default async function setup(config) {
  const release=verifyRelease();
  if(release.digest!==config.metadata.artifactSha256) throw new Error('ZIP changed after the test run was configured.');
  process.env.PM_RELEASE_ENTRY=pathToFileURL(`${release.dir}/index.html`).href;
  // A clean OS temporary directory, never dist/, is the browser test target.
  return ()=>fs.rmSync(release.dir,{recursive:true,force:true});
}
