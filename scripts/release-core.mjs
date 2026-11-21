import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const APP_FILES = Object.freeze(['index.html','js/app.js','css/style.css','config.json','icon.svg','favicon.ico','robots.txt','icon.png','og-image.png','404.html','site.webmanifest']);
export const EXTRA_FILES = Object.freeze(['LICENSE.txt','START-HERE.txt','release.json']);
export const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], {encoding:'utf8'}).trim();
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export function releasePaths(root = ROOT) {
  const version = readJSON(path.join(root,'package.json')).version;
  if (!VERSION.test(version)) throw new Error('Release tooling requires a stable MAJOR.MINOR.PATCH package version.');
  const dir = path.join(root,'release');
  const name = `pm-ops-map-v${version}.zip`;
  return {root,version,dir,name,zip:path.join(dir,name),checksum:path.join(dir,`${name}.sha256`),metadataFile:path.join(dir,'release.json'),report:path.join(dir,'test-report.json'),verification:path.join(dir,'verification.json'),notes:path.join(dir,'RELEASE-NOTES.md')};
}
export function validateSource(root = ROOT, tag = '') {
  const p = releasePaths(root);
  const lock = readJSON(path.join(root,'package-lock.json'));
  if (lock.version !== p.version || lock.packages?.['']?.version !== p.version) throw new Error('package.json and package-lock.json versions must agree.');
  const sourceCommit = git(root,'rev-parse','HEAD');
  const sourceDirty = !!git(root,'status','--porcelain','--untracked-files=normal');
  if (tag) {
    if (tag !== `v${p.version}`) throw new Error('Release tag must match the package version.');
    if (git(root,'rev-parse',`refs/tags/${tag}^{commit}`) !== sourceCommit) throw new Error('Release tag must resolve to the checked-out commit.');
    if (sourceDirty) throw new Error('Tagged release requires a clean working tree.');
  }
  return {version:p.version,releaseTag:tag || null,sourceCommit,sourceDirty};
}
function copyRegular(from, to) {
  const stat = fs.lstatSync(from);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Not a regular production file: ${from}`);
  fs.mkdirSync(path.dirname(to),{recursive:true}); fs.copyFileSync(from,to); fs.chmodSync(to,0o644);
}
export function packageRelease({root = ROOT, tag = ''} = {}) {
  const p = releasePaths(root);
  const source = validateSource(root,tag);
  const buildRoot = fs.realpathSync(path.join(root,'dist'));
  for (const name of APP_FILES) {
    if(!fs.realpathSync(path.join(root,'dist',name)).startsWith(buildRoot+path.sep)) throw new Error('Production asset escapes dist/.');
  }
  const stage = fs.mkdtempSync(path.join(os.tmpdir(),'pm-release-stage-'));
  try {
    for (const name of APP_FILES) copyRegular(path.join(root,'dist',name),path.join(stage,name));
    const html = fs.readFileSync(path.join(stage,'index.html'),'utf8');
    if (!html.includes('window.__PM_OPS_CONFIG__=') || html.includes('type="module"')) throw new Error('Package requires the production file-compatible build.');
    for (const match of html.matchAll(/(?:src|href)="([^"#?]+)(?:[?#][^"]*)?"/g)) {
      const ref = match[1];
      if (/^(https?:|data:|mailto:|\/\/)/.test(ref) || ref === './') continue;
      if (!APP_FILES.includes(ref.replace(/^\.\//,''))) throw new Error(`Unpackaged local asset: ${ref}`);
    }
    copyRegular(path.join(root,'LICENSE.txt'),path.join(stage,'LICENSE.txt'));
    fs.writeFileSync(path.join(stage,'START-HERE.txt'),`PM Ops Map ${p.version}\n\n1. Extract the entire ZIP. Keep index.html and its asset folders together.\n2. Open index.html in a current compatible desktop browser. The default app works offline.\n3. Follow the setup guide, or explore the isolated demo. Terms & Help explains operator language.\n\nDATA AND RECOVERY\nYour workspace is saved unencrypted in this browser. Clearing site data, changing browsers, or moving/replacing the app can make that workspace unavailable. Export JSON to a separate location, verify the file exists, and use import review to recover or move a workspace. Five browser-local snapshots are not off-device backup.\n\nOn iPhone use https://hypnoticdata777.github.io/pm-ops-map/ ; local HTML through Files and physical Safari compatibility have not been verified. Hosted and local workspaces do not transfer automatically. Team Sync is optional, self-hosted, and intended for trusted teams.\n\nRecurring templates create batches manually. Workload counts tasks, not effort or availability. Vendor assignment does not dispatch a vendor. Balances are operating context, not an accounting ledger.\n\nBuild commit: ${source.sourceCommit}\nLocal uncommitted changes: ${source.sourceDirty ? 'YES - development candidate, not a tagged release' : 'no'}\nRelease tag: ${source.releaseTag || 'none - local candidate'}\n`);
    const files = Object.fromEntries([...APP_FILES,'LICENSE.txt','START-HERE.txt'].map(name=>[name,sha256(fs.readFileSync(path.join(stage,name)))]));
    const metadata = {...source,builtAt:new Date().toISOString(),files};
    fs.writeFileSync(path.join(stage,'release.json'),JSON.stringify(metadata,null,2)+'\n');
    fs.mkdirSync(p.dir,{recursive:true});
    // Invalidate old evidence before replacing a local candidate. Remote releases are never overwritten.
    for (const file of [p.zip,p.checksum,p.report,p.verification,p.metadataFile,p.notes]) fs.rmSync(file,{force:true});
    execFileSync('zip',['-X','-q',p.zip,...APP_FILES,...EXTRA_FILES],{cwd:stage});
    const digest = sha256(fs.readFileSync(p.zip));
    fs.writeFileSync(p.checksum,`${digest}  ${p.name}\n`);
    fs.copyFileSync(path.join(stage,'release.json'),p.metadataFile);
    fs.writeFileSync(p.notes,`# PM Ops Map ${p.version}\n\nSource commit: ${source.sourceCommit}\n\nIncludes the seven-step operation setup, responsibility map, maintenance and portfolio tools, Terms & Help, and JSON/CSV/handbook exports.\n\nReview the extracted-artifact test report and checksum before publishing. Browser evidence is Chromium on Linux, including desktop file:// use; physical iPhone Safari and WebKit remain unverified.\n\nExtract the entire ZIP and read START-HERE.txt. Workspace data remains browser-local and unencrypted by default. Export JSON separately for recovery. This release does not add automated scheduling, payment processing, vendor dispatch, or managed backups.\n`);
    return {...p,metadata,digest};
  } finally { fs.rmSync(stage,{recursive:true,force:true}); }
}

// Inspect the central directory before invoking unzip: exact paths, no duplicates,
// encrypted entries, symlinks, ZIP64/multi-disk archives, or oversized expansions.
export function archiveEntries(buffer) {
  let end = -1;
  for (let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50 && i+22+buffer.readUInt16LE(i+20)===buffer.length) { end=i;break; }
  }
  if (end<0 || buffer.readUInt16LE(end+4) || buffer.readUInt16LE(end+6)) throw new Error('Unsupported ZIP directory.');
  const count=buffer.readUInt16LE(end+10), size=buffer.readUInt32LE(end+12), start=buffer.readUInt32LE(end+16);
  if (count !== buffer.readUInt16LE(end+8) || count > 100 || start+size !== end) throw new Error('Invalid ZIP directory bounds.');
  let offset=start,total=0; const names=[];
  for(let i=0;i<count;i++) {
    if(offset+46>end || buffer.readUInt32LE(offset)!==0x02014b50) throw new Error('Invalid ZIP entry.');
    const flags=buffer.readUInt16LE(offset+8), method=buffer.readUInt16LE(offset+10), length=buffer.readUInt16LE(offset+28);
    const next=offset+46+length+buffer.readUInt16LE(offset+30)+buffer.readUInt16LE(offset+32);
    if(next>end) throw new Error('Invalid ZIP name bounds.');
    const name=buffer.subarray(offset+46,offset+46+length).toString('utf8');
    const mode=(buffer.readUInt32LE(offset+38)>>>16)&0xf000;
    total+=buffer.readUInt32LE(offset+24);
    if(![...APP_FILES,...EXTRA_FILES].includes(name) || names.includes(name) || (flags&1) || ![0,8].includes(method) || ![0,0x8000].includes(mode) || total>25*1024*1024) throw new Error(`Unsafe or unexpected ZIP entry: ${name}`);
    names.push(name);offset=next;
  }
  if(offset!==end || names.length!==APP_FILES.length+EXTRA_FILES.length) throw new Error('Missing or extra ZIP entries.');
  return names;
}
export function verifyRelease({root=ROOT,extract=true}={}) {
  const p=releasePaths(root); const bytes=fs.readFileSync(p.zip); const digest=sha256(bytes);
  if(fs.readFileSync(p.checksum,'utf8')!==`${digest}  ${p.name}\n`) throw new Error('Archive checksum mismatch.');
  const entries=archiveEntries(bytes);
  execFileSync('unzip',['-tqq',p.zip]);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pm-release-extracted-'));
  try {
    execFileSync('unzip',['-q',p.zip,'-d',dir]);
    const metadata=readJSON(path.join(dir,'release.json'));
    if(metadata.version!==p.version || !/^[a-f0-9]{40}$/.test(metadata.sourceCommit) || typeof metadata.sourceDirty!=='boolean' || !metadata.builtAt) throw new Error('Invalid release metadata.');
    if(fs.readFileSync(path.join(dir,'release.json'),'utf8')!==fs.readFileSync(p.metadataFile,'utf8')) throw new Error('Metadata sidecar does not match archive.');
    const expected=[...APP_FILES,'LICENSE.txt','START-HERE.txt'].sort();
    if(JSON.stringify(Object.keys(metadata.files || {}).sort())!==JSON.stringify(expected)) throw new Error('Invalid file manifest.');
    for(const name of entries) {
      const file=path.join(dir,name); if(!fs.lstatSync(file).isFile()) throw new Error('Extracted non-file.');
      if(name!=='release.json' && sha256(fs.readFileSync(file))!==metadata.files[name]) throw new Error(`File digest mismatch: ${name}`);
    }
    if(extract) return {...p,dir,metadata,digest,entries};
    return {...p,metadata,digest,entries};
  } catch(error) { fs.rmSync(dir,{recursive:true,force:true});throw error; }
  finally { if(!extract) fs.rmSync(dir,{recursive:true,force:true}); }
}
export function recordVerification(root=ROOT) {
  const result=verifyRelease({root,extract:false});
  const report=readJSON(result.report);
  if(report.config?.metadata?.artifactSha256!==result.digest || !Number.isSafeInteger(report.stats?.expected) || report.stats.expected<1 || report.stats?.unexpected!==0 || report.stats?.flaky!==0 || report.stats?.skipped!==0 || report.errors?.length) throw new Error('Browser report is missing, failed, skipped, or belongs to another ZIP.');
  const verification={status:'passed',artifactSha256:result.digest,sourceCommit:result.metadata.sourceCommit,reportSha256:sha256(fs.readFileSync(result.report)),tests:report.stats.expected,verifiedAt:new Date().toISOString()};
  fs.writeFileSync(result.verification,JSON.stringify(verification,null,2)+'\n');return verification;
}
export function checkVerification(root=ROOT) {
  const result=verifyRelease({root,extract:false});
  const proof=readJSON(result.verification), report=readJSON(result.report);
  if(proof.status!=='passed' || proof.artifactSha256!==result.digest || proof.sourceCommit!==result.metadata.sourceCommit || proof.reportSha256!==sha256(fs.readFileSync(result.report)) || report.config?.metadata?.artifactSha256!==result.digest || !Number.isSafeInteger(report.stats?.expected) || report.stats.expected<1 || report.stats.unexpected!==0 || report.stats.flaky!==0 || report.stats.skipped!==0 || report.errors?.length) throw new Error('Release verification is stale or invalid.');
  return {...result,proof};
}
