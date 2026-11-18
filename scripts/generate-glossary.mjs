import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GLOSSARY_ENTRIES, GLOSSARY_CATEGORIES } from '../js/glossaryData.js';

export function buildGlossaryMarkdown() {
  const lines = ['# User Glossary', '',
    'Operator terminology used by PM Ops Map. Open **Terms & Help** in the application to search these definitions.', '',
    '<!-- Generated from js/glossaryData.js. Edit that source, then run npm run glossary:generate. -->', '',
    'Definitions describe application behavior, not legal requirements. Responsibility owners and property owners are distinct. Setup progress is separate from operational readiness.', ''];
  for (const category of GLOSSARY_CATEGORIES) {
    lines.push(`## ${category.label}`, '');
    for (const entry of GLOSSARY_ENTRIES.filter(e => e.category === category.id)) {
      lines.push(`### ${entry.term}`, '', entry.definition, '');
      if (entry.aliases.length) lines.push(`Search aliases: ${entry.aliases.join(', ')}.`, '');
    }
  }
  return lines.join('\n');
}
const file = fileURLToPath(new URL('../docs/user-glossary.md', import.meta.url));
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = buildGlossaryMarkdown();
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== output) {
      console.error('User glossary is stale. Run npm run glossary:generate.'); process.exitCode = 1;
    } else console.log('User glossary matches the shared definitions.');
  } else { fs.writeFileSync(file, output); console.log('Generated docs/user-glossary.md'); }
}
