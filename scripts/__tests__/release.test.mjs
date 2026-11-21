import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, APP_FILES, EXTRA_FILES, packageRelease, verifyRelease, validateSource, releasePaths, sha256, archiveEntries, recordVerification, checkVerification } from '../release-core.mjs';
import { createDraftRelease } from '../release-draft.mjs';
const git=(root,...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'pm-release-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({version:'1.0.0'}));
  fs.writeFileSync(path.join(root,'package-lock.json'),JSON.stringify({version:'1.0.0',packages:{'':{version:'1.0.0'}}}));
  fs.writeFileSync(path.join(root,'.gitignore'),'dist/\nrelease/\n');
  fs.copyFileSync(path.join(ROOT,'LICENSE.txt'),path.join(root,'LICENSE.txt'));
  for(const name of APP_FILES) { const file=path.join(root,'dist',name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'public asset'); }
  fs.writeFileSync(path.join(root,'dist/index.html'),'<script>window.__PM_OPS_CONFIG__={}</script><script src="js/app.js" defer></script><link href="css/style.css">');
  git(root,'init','-q');git(root,'add','.');git(root,'-c','user.name=Release Test','-c','user.email=release-test@example.invalid','commit','-qm','fixture');
  return root;
}
function report(root,digest,overrides={}) {
  const p=releasePaths(root);
  fs.writeFileSync(p.report,JSON.stringify({config:{metadata:{artifactSha256:digest}},stats:{expected:6,unexpected:0,flaky:0,skipped:0,...overrides},errors:[]}));
}
function tagged(t) { const root=fixture(t);git(root,'tag','v1.0.0');const result=packageRelease({root,tag:'v1.0.0'});report(root,result.digest);recordVerification(root);return {root,result}; }

test('packages exactly production assets plus instructions, metadata and license; extras do not leak',t=>{
  const root=fixture(t);fs.writeFileSync(path.join(root,'dist/private.env'),'do not package');
  const result=packageRelease({root}); const verified=verifyRelease({root});t.after(()=>fs.rmSync(verified.dir,{recursive:true,force:true}));
  assert.deepEqual(verified.entries.sort(),[...APP_FILES,...EXTRA_FILES].sort());
  assert.equal(verified.metadata.sourceCommit,git(root,'rev-parse','HEAD'));
  assert.equal(verified.metadata.sourceDirty,false);
  assert.equal(verified.metadata.releaseTag,null);
  assert.match(fs.readFileSync(path.join(verified.dir,'START-HERE.txt'),'utf8'),/browser-local snapshots/);
  assert.equal(result.digest,sha256(fs.readFileSync(result.zip)));
});
test('version, source cleanliness and tag identity are enforced without creating tags',t=>{
  const root=fixture(t);assert.throws(()=>validateSource(root,'v2.0.0'),/match/);
  git(root,'tag','v1.0.0');assert.equal(validateSource(root,'v1.0.0').releaseTag,'v1.0.0');
  fs.writeFileSync(path.join(root,'changed.txt'),'dirty');assert.throws(()=>validateSource(root,'v1.0.0'),/clean/);
  assert.equal(packageRelease({root}).metadata.sourceDirty,true);
  fs.rmSync(path.join(root,'changed.txt'));fs.writeFileSync(path.join(root,'package-lock.json'),JSON.stringify({version:'2.0.0',packages:{'':{version:'2.0.0'}}}));
  assert.throws(()=>validateSource(root),/versions must agree/);
});
test('a tag pointing at another commit cannot label a release',t=>{
  const root=fixture(t);git(root,'tag','v1.0.0');fs.writeFileSync(path.join(root,'new.txt'),'new');git(root,'add','.');git(root,'-c','user.name=Release Test','-c','user.email=release-test@example.invalid','commit','-qm','new');
  assert.throws(()=>validateSource(root,'v1.0.0'),/checked-out commit/);
});
test('rejects source builds, missing assets and symlinks',t=>{
  const root=fixture(t);fs.writeFileSync(path.join(root,'dist/index.html'),'<script type="module" src="js/app.js"></script>');
  assert.throws(()=>packageRelease({root}),/production/);
  fs.rmSync(path.join(root,'dist/icon.svg'));assert.throws(()=>packageRelease({root}));
  fs.symlinkSync(path.join(root,'LICENSE.txt'),path.join(root,'dist/icon.svg'));assert.throws(()=>packageRelease({root}),/escapes|regular/);
});
test('rejects unsafe names, duplicate names, symlink metadata and oversized ZIP expansion',t=>{
  const root=fixture(t);const result=packageRelease({root});const original=fs.readFileSync(result.zip);
  const start=original.readUInt32LE(original.length-6);
  const symlink=Buffer.from(original);symlink.writeUInt32LE(0xa1ff0000>>>0,start+38);assert.throws(()=>archiveEntries(symlink),/Unsafe/);
  const traversal=Buffer.from(original);Buffer.from('../bad.txt').copy(traversal,start+46);assert.throws(()=>archiveEntries(traversal),/Unsafe/);
  const huge=Buffer.from(original);huge.writeUInt32LE(30*1024*1024,start+24);assert.throws(()=>archiveEntries(huge),/Unsafe/);
  const duplicate=Buffer.from(original);let offset=start;let second;
  for(let i=0;i<APP_FILES.length+EXTRA_FILES.length;i++) {const length=duplicate.readUInt16LE(offset+28);if(duplicate.subarray(offset+46,offset+46+length).toString()==='robots.txt')second=offset;offset+=46+length+duplicate.readUInt16LE(offset+30)+duplicate.readUInt16LE(offset+32);}
  // robots.txt and index.html both have ten-byte names.
  Buffer.from('index.html').copy(duplicate,second+46);assert.throws(()=>archiveEntries(duplicate),/Unsafe/);
});
test('archive tampering and altered packaged files fail verification',t=>{
  const root=fixture(t);const result=packageRelease({root});fs.appendFileSync(result.zip,'tampered');assert.throws(()=>verifyRelease({root}),/checksum/);
  packageRelease({root});const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pm-tamper-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));fs.mkdirSync(path.join(temp,'css'));fs.writeFileSync(path.join(temp,'css/style.css'),'tampered stylesheet contents');fs.utimesSync(path.join(temp,'css/style.css'),2000000000,2000000000);
  execFileSync('zip',['-q',result.zip,'css/style.css'],{cwd:temp});
  fs.writeFileSync(result.checksum,`${sha256(fs.readFileSync(result.zip))}  ${result.name}\n`);
  assert.throws(()=>verifyRelease({root}),/digest mismatch/);
});
test('failed, stale and skipped browser reports cannot certify an artifact',t=>{
  const root=fixture(t);const result=packageRelease({root});report(root,'wrong');assert.throws(()=>recordVerification(root),/report/);
  for(const overrides of [{unexpected:1},{skipped:1},{flaky:1},{expected:0}]) {report(root,result.digest,overrides);assert.throws(()=>recordVerification(root),/report/);}
  report(root,result.digest);recordVerification(root);assert.equal(checkVerification(root).proof.tests,6);
  fs.appendFileSync(result.report,' ');assert.throws(()=>checkVerification(root),/stale/);
});
test('packaging a new candidate invalidates previous verification',t=>{
  const {root,result}=tagged(t);assert.ok(fs.existsSync(result.verification));packageRelease({root,tag:'v1.0.0'});assert.equal(fs.existsSync(result.verification),false);
});
test('draft creation uses the verified tag and tested bytes, with no publish or overwrite flags',t=>{
  const {root,result}=tagged(t);const calls=[];
  const run=args=>{calls.push(args);if(args[0]==='api' && args.includes('--jq'))return result.metadata.sourceCommit;if(args[0]==='api')return '[]';return 'draft URL';};
  assert.equal(createDraftRelease({root,repo:'owner/repo',tag:'v1.0.0',run}),'draft URL');
  const create=calls.find(a=>a[0]==='release');assert.ok(create.includes('--draft'));assert.ok(create.includes('--verify-tag'));assert.ok(create.includes(result.zip));assert.equal(create.includes('--clobber'),false);
});
test('existing draft and published releases are never modified',t=>{
  const {root,result}=tagged(t);
  for(const draft of [true,false]) {const calls=[];const run=args=>{calls.push(args);return args.includes('--jq')?result.metadata.sourceCommit:JSON.stringify([[{tag_name:'v1.0.0',draft}]]);};assert.throws(()=>createDraftRelease({root,repo:'owner/repo',tag:'v1.0.0',run}),/left untouched/);assert.equal(calls.some(a=>a[0]==='release'),false);}
});
test('remote tag movement and API failures stop before any release write',t=>{
  const {root}=tagged(t);let writes=0;
  assert.throws(()=>createDraftRelease({root,repo:'owner/repo',tag:'v1.0.0',run:args=>{if(args[0]==='release')writes++;return '0'.repeat(40);}}),/Remote tag/);
  assert.throws(()=>createDraftRelease({root,repo:'owner/repo',tag:'v1.0.0',run:()=>{throw Error('HTTP 503');}}),/503/);assert.equal(writes,0);
});
