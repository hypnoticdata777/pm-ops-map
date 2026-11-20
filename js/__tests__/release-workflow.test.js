import fs from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, test } from 'vitest';
const workflow=parse(fs.readFileSync('.github/workflows/release.yml','utf8'));
const steps=JSON.stringify(workflow.jobs.validate.steps);
describe('release validation and draft-only automation',()=>{
  test('tag and manual triggers name existing version tags; PRs can validate without publishing',()=>{
    expect(workflow.on.push.tags).toEqual(['v*']);
    expect(workflow.on.workflow_dispatch.inputs.tag.required).toBe(true);
    expect(workflow.on.pull_request.branches).toEqual(['master']);
    expect(workflow.jobs.draft.if).toContain("github.event_name != 'pull_request'");
    expect(workflow.jobs.draft.if).toContain("needs.validate.outputs.tag != ''");
  });
  test('validation is read-only and only the dependent draft job can write releases',()=>{
    expect(workflow.permissions).toEqual({contents:'read'});
    expect(workflow.jobs.validate.permissions).toBeUndefined();
    expect(workflow.jobs.draft.needs).toBe('validate');
    expect(workflow.jobs.draft.permissions).toEqual({contents:'write',actions:'read'});
    expect(JSON.stringify(workflow.jobs.draft.steps)).toContain('needs.validate.outputs.source_commit');
    expect(JSON.stringify(workflow.jobs.draft.steps)).toContain('needs.validate.outputs.artifact_id');
  });
  test('the tested candidate, not a rebuild in the write job, reaches draft preparation',()=>{
    for(const command of ['validate-release-ref.mjs','npm run glossary:check','npm run typecheck','npm test','npm run test:release:unit','npm run test:e2e','npm run release:package','npm run test:release']) expect(steps).toContain(command);
    const names=workflow.jobs.validate.steps.map(s=>s.name||s.run||s.uses);
    expect(names.indexOf('Build once and package candidate')).toBeLessThan(names.indexOf('Test extracted ZIP and record checksum-bound verification'));
    expect(JSON.stringify(workflow.jobs.draft.steps)).not.toMatch(/npm run build|npm ci|release:package/);
    expect(JSON.stringify(workflow.jobs.draft.steps)).toContain('release-draft.mjs');
  });
});
