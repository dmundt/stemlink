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

export async function exerciseWorkbench(page, within) {
  const activity = page.getByRole('tab', { name: /Stemlink/ });
  await within(activity.waitFor({ timeout: 30_000 }), 45_000, 'Finding the Stemlink activity tab');
  try {
    await within(activity.click(), 45_000, 'Selecting the Stemlink activity tab');
  } catch (error) {
    let tabs;
    try {
      tabs = await within(
        page.locator('[role="tab"]').evaluateAll((elements) =>
          elements.map((element) => ({
            label: element.getAttribute('aria-label'),
            title: element.getAttribute('title'),
            text: element.textContent?.trim(),
          })),
        ),
        5_000,
        'Reading activity tab diagnostics',
      );
    } catch (diagnosticError) {
      throw new AggregateError([error, diagnosticError], 'Could not diagnose the activity tab', {
        cause: diagnosticError,
      });
    }
    throw new Error(`Could not select the Stemlink activity tab: ${JSON.stringify(tabs)}`, {
      cause: error,
    });
  }
  const note = page.getByRole('treeitem', { name: '202601011200-ui-fixture.md' });
  await within(note.waitFor({ timeout: 30_000 }), 45_000, 'Finding the fixture note');
  await within(note.click(), 45_000, 'Opening the fixture note');
  await within(
    page.getByRole('tab', { name: /202601011200-ui-fixture\.md/ }).waitFor({ timeout: 30_000 }),
    45_000,
    'Finding the fixture editor',
  );
}
