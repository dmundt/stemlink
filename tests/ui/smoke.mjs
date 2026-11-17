import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function prepareWorkspace(workspace) {
  const vault = join(workspace, 'notes');
  await mkdir(join(vault, 'permanent'), { recursive: true });
  await mkdir(join(vault, 'inbox'), { recursive: true });
  await writeFile(
    join(vault, '.stemlink.json'),
    JSON.stringify({ version: 1, inbox: 'inbox', notes: 'permanent' }),
  );
  await writeFile(
    join(vault, 'permanent', '202601011200-ui-fixture.md'),
    '---\ntitle: UI Fixture Note\ntags: []\n---\n\nFixture note.\n',
  );
}

export async function exerciseWorkbench(page) {
  const activity = page.getByRole('tab', { name: /Stemlink/ });
  await activity.waitFor({ timeout: 30_000 });
  await activity.click();
  const note = page.getByRole('treeitem', { name: '202601011200-ui-fixture.md' });
  await note.waitFor({ timeout: 30_000 });
  await note.click();
  await page.getByRole('tab', { name: /202601011200-ui-fixture\.md/ }).waitFor({ timeout: 30_000 });
}
