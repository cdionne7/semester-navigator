import {mkdir,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {test,expect,openDashboard,changeAvailability,readPlan} from './fixtures.mjs';

async function openRubricHelp(page) {
  await page.getByRole('button',{name:'All work',exact:true}).click();
  await page.getByRole('button',{name:'Check my rubric',exact:true}).click();
  const dialog = page.getByRole('dialog',{name:'Continue in ChatGPT'});
  await expect(dialog).toBeVisible();
  return dialog;
}
async function expectNoDesktopRoute(page, dialog) {
  await expect(dialog.getByRole('link',{name:'Open desktop chat',exact:true})).toHaveCount(0);
  await expect(page.locator('a[href^="codex://"]')).toHaveCount(0);
  await expect(page.locator('a[href^="https://chatgpt.com"], a[href^="https://chat.openai.com"]')).toHaveCount(0);
}
async function expectCopyWorks(page, dialog, workspace) {
  const prompt = await dialog.getByLabel('Request for Semester Navigator').inputValue();
  expect(prompt).toContain(workspace.seed.profileId);
  expect(prompt).toContain(workspace.seed.tasks[0].rubric);
  await page.evaluate(() => {
    window.copiedSemesterRequest = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable:true,
      value:{writeText:async value => { window.copiedSemesterRequest = value; }},
    });
  });
  await dialog.getByRole('button',{name:'Copy request',exact:true}).click();
  await expect.poll(() => page.evaluate(() => window.copiedSemesterRequest)).toBe(prompt);
}

for (const educationLevel of ['college','high-school']) {
  test.describe(educationLevel+' desktop chat handoff', () => {
    test.use({educationLevel});
    test('uses the actual student root and selected IDs while keeping coursework out of the link', async({page,request,workspace}) => {
      if (educationLevel === 'high-school') await page.setViewportSize({width:390,height:844});
      await openDashboard(page, workspace);
      const runtimeResponse = await request.get(workspace.url+'/api/runtime');
      expect(runtimeResponse.status()).toBe(200);
      const workspacePath = await realpath(workspace.root);
      expect(await runtimeResponse.json()).toEqual({mode:'local', profileId:workspace.seed.profileId, workspacePath});

      const dialog = await openRubricHelp(page);
      const desktop = dialog.getByRole('link',{name:'Open desktop chat',exact:true});
      await expect(desktop).toBeVisible();
      const url = new URL(await desktop.getAttribute('href'));
      expect(url.protocol).toBe('codex:');
      expect(url.hostname).toBe('new');
      expect(url.hash).toBe('');
      expect([...url.searchParams.keys()]).toEqual(['path','prompt']);
      expect(url.searchParams.get('path')).toBe(workspacePath);
      const prompt = url.searchParams.get('prompt');
      expect(prompt).toContain('[@Semester Navigator](plugin://semester-navigator@semester-navigator)');
      expect(prompt).toContain(JSON.stringify(workspace.seed.profileId));
      expect(prompt).toContain('Selected assignment ID: "homework"');
      expect(prompt).toContain('Selected course ID: "math"');
      expect(prompt).toContain('Stop on a mismatch');
      expect(prompt).toContain('current saved plan');
      expect(prompt).not.toMatch(/Astra|model=/i);
      for (const privateText of [workspace.seed.name, workspace.seed.tasks[0].title, workspace.seed.tasks[0].rubric, workspace.seed.courses[0].name]) {
        expect(prompt).not.toContain(privateText);
      }
      await expect(dialog).toContainText('Choose Astra in the model picker if available, then press Send.');
      await expect(dialog).toContainText('Nothing is sent automatically.');

      await dialog.getByText('Continue from my phone',{exact:true}).click();
      await expect(dialog.getByText(/For a local desktop workspace, open Remote/)).toBeVisible();
      await expect(dialog).toContainText('choose your computer');
      await expect(dialog).toContainText('Settings → Connections → Control this Mac or PC');
      await expect(dialog).toContainText('Keep the computer awake, online and ChatGPT running.');
      await expect(dialog).toContainText('A local dashboard address does not open on your phone');
      await expect(dialog.getByRole('link',{name:'Set up phone access'})).toHaveAttribute('href','https://learn.chatgpt.com/docs/remote-connections');
      await expect(dialog).not.toContainText('A hosted dashboard has separate storage.');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const bounds = await dialog.boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x+bounds.width).toBeLessThanOrEqual(page.viewportSize().width);
      expect(bounds.height).toBeLessThanOrEqual(page.viewportSize().height);
      expect(await dialog.evaluate(element => {
        const noHorizontalOverflow = element.scrollWidth <= element.clientWidth;
        element.scrollTop = element.scrollHeight;
        const scrollable = element.scrollHeight > element.clientHeight && element.scrollTop > 0;
        element.scrollTop = 0;
        return {noHorizontalOverflow, scrollable};
      })).toEqual({noHorizontalOverflow:true, scrollable:true});
      if (process.env.SEMESTER_HANDOFF_SCREENSHOTS) {
        await mkdir(process.env.SEMESTER_HANDOFF_SCREENSHOTS,{recursive:true});
        await page.screenshot({path:join(process.env.SEMESTER_HANDOFF_SCREENSHOTS, educationLevel === 'high-school' ? 'semester-chat-handoff-mobile.png' : 'semester-chat-handoff-desktop.png')});
      }
    });
  });
}

for (const scenario of ['mismatched identity','unavailable','missing endpoint']) {
  test('runtime '+scenario+' preserves the copy fallback without a desktop or generic homepage link', async({page,workspace}) => {
    await page.route('**/api/runtime', route => route.fulfill({
      status:scenario === 'unavailable' ? 503 : scenario === 'missing endpoint' ? 404 : 200,
      contentType:'application/json',
      body:JSON.stringify(scenario === 'mismatched identity'
        ? {mode:'local',profileId:'another-student',workspacePath:'/synthetic/other-student'}
        : {error:'Synthetic runtime unavailable'}),
    }));
    await openDashboard(page, workspace);
    const dialog = await openRubricHelp(page);
    await expect(dialog).toContainText('This page cannot select that project automatically.');
    await expectNoDesktopRoute(page, dialog);
    await expectCopyWorks(page, dialog, workspace);
    await dialog.getByText('Continue from my phone',{exact:true}).click();
    await expect(dialog.getByText(/A hosted dashboard has separate storage/)).toBeVisible();
    await expect(dialog).toContainText('It does not automatically sync with a desktop workspace or connect its plan to a phone chat.');
  });
}

test('saving, pending, and conflicting edits keep desktop handoff disabled while copy remains usable', async({page,request,workspace}) => {
  await openDashboard(page, workspace);
  let release;
  let intercepted;
  const held = new Promise(resolve => { release = resolve; });
  const sent = new Promise(resolve => { intercepted = resolve; });
  let writes = 0;
  await page.route('**/api/plan', async route => {
    if (route.request().method() === 'PUT' && ++writes === 1) {
      intercepted();
      await held;
      return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic save outage'})});
    }
    return route.continue();
  });
  try {
    await changeAvailability(page, 'My changes have not reached the saved plan');
    await sent;
    await expect(page.getByText('Saving changes',{exact:true})).toBeVisible();
    const dialog = await openRubricHelp(page);
    await expect(dialog).toContainText('Save or resolve pending changes before opening a new desktop chat.');
    await expectNoDesktopRoute(page, dialog);
    release();
    await expect(page.getByText('Changes waiting to save',{exact:true})).toBeVisible();
    await expectNoDesktopRoute(page, dialog);
    await expectCopyWorks(page, dialog, workspace);

    await page.keyboard.press('Escape');
    const current = await readPlan(request, workspace);
    current.plan.workHours = 'Newer assistant save';
    const externalSave = await request.put(workspace.url+'/api/plan',{data:{plan:current.plan,baseRevision:current.revision}});
    expect(externalSave.status()).toBe(200);
    await page.getByRole('button',{name:'Save pending changes',exact:true}).click();
    await expect(page.getByText('Another saved version needs review',{exact:true})).toBeVisible();
    const conflicting = await openRubricHelp(page);
    await expect(conflicting).toContainText('Save or resolve pending changes before opening a new desktop chat.');
    await expectNoDesktopRoute(page, conflicting);
    await expectCopyWorks(page, conflicting, workspace);
    expect(writes).toBe(2);
  } finally { release(); }
});
