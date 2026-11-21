import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { ROOT, checkVerification, validateSource } from './release-core.mjs';

export function createDraftRelease({root=ROOT,repo,tag,run=args=>execFileSync('gh',args,{encoding:'utf8'})}) {
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo || '') || !tag) throw new Error('A repository and an existing version tag are required.');
  const source=validateSource(root,tag);
  const artifact=checkVerification(root);
  if(artifact.metadata.sourceDirty || artifact.metadata.sourceCommit!==source.sourceCommit || artifact.metadata.releaseTag!==tag) throw new Error('Artifact must come from this clean, tagged commit.');
  const remoteCommit=run(['api',`repos/${repo}/commits/${tag}`,'--jq','.sha']).trim();
  if(remoteCommit!==source.sourceCommit) throw new Error('Remote tag moved or does not match the tested commit.');
  // Fail closed on API errors. Never edit, delete, or clobber an existing release.
  const pages=JSON.parse(run(['api','--paginate','--slurp',`repos/${repo}/releases?per_page=100`]));
  const existing=pages.flat().find(item=>item.tag_name===tag);
  if(existing) throw new Error(`Release ${tag} already exists (${existing.draft ? 'draft' : 'published'}); left untouched. Review it or choose a new version.`);
  const report=artifact.proof;
  const notes=fs.readFileSync(artifact.notes,'utf8').split('\n## Extracted artifact verification')[0];
  fs.writeFileSync(artifact.notes,`${notes}\n## Extracted artifact verification\n\n${report.tests} Chromium tests passed against the extracted ZIP.\n\nZIP SHA-256: ${artifact.digest}\nTest report SHA-256: ${report.reportSha256}\n\nReview the candidate and browser limitations before publication.\n`);
  const assets=[artifact.zip,artifact.checksum,artifact.metadataFile,artifact.verification];
  return run(['release','create',tag,...assets,'--repo',repo,'--verify-tag','--draft','--target',source.sourceCommit,'--title',`PM Ops Map ${source.version}`,'--notes-file',artifact.notes]);
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try { console.log(createDraftRelease({repo:process.env.GITHUB_REPOSITORY,tag:process.env.RELEASE_TAG})); }
  catch(error) { console.error(error.message);process.exitCode=1; }
}
