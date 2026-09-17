import { test, expect, openDashboard, readPlan, saved } from './fixtures.mjs';

test('optional work stays labeled and editable without taking over required next actions or totals', async ({ page, request, workspace }) => {
  const initial = await readPlan(request, workspace);
  const response = await request.put(workspace.url + '/api/plan', { data: {
    baseRevision: initial.revision,
    plan: { ...initial.plan, tasks: [...initial.plan.tasks,
      { id: 'optional-past', courseId: 'math', title: 'Optional practice', dueAt: '2026-09-07', minutes: 90, optional: true },
      { id: 'optional-unknown', courseId: 'math', title: 'Optional enrichment', dueAt: null, optional: true },
    ] },
  } });
  expect(response.status()).toBe(200);
  await openDashboard(page, workspace);
  const nextAction = page.getByRole('region', { name: 'Your next action' });
  await expect(nextAction.getByRole('heading', { name: 'Problem set', exact: true })).toBeVisible();
  const totals = page.getByRole('region', { name: 'Semester totals' });
  await expect(totals.locator('div').filter({ hasText: 'required assignments left' }).locator('strong')).toHaveText('1');
  await expect(totals.locator('div').filter({ hasText: 'unknown required deadlines' }).locator('strong')).toHaveText('0');
  await expect(totals.locator('div').filter({ hasText: 'required completed' }).locator('strong')).toHaveText('0');
  await page.getByRole('button', { name: 'All work', exact: true }).click();
  const optionalRow = page.locator('.task-list li').filter({ has: page.getByRole('heading', { name: 'Optional practice', exact: true }) });
  await expect(optionalRow.getByText('Optional', { exact: true })).toBeVisible();
  await optionalRow.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Optional assignment', { exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  const requiredRow = page.locator('.task-list li').filter({ has: page.getByRole('heading', { name: 'Problem set', exact: true }) });
  await requiredRow.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Optional assignment', { exact: true }).check();
  await page.getByRole('button', { name: 'Save assignment', exact: true }).click();
  await saved(page);
  await page.reload();
  await saved(page);
  expect((await readPlan(request, workspace)).plan.tasks.find(task => task.id === 'homework').optional).toBe(true);
  await expect(nextAction.getByRole('heading', { name: 'Your known required work is complete', exact: true })).toBeVisible();
  await expect(totals.locator('div').filter({ hasText: 'required assignments left' }).locator('strong')).toHaveText('0');
  await page.getByRole('button', { name: 'All work', exact: true }).click();
  await requiredRow.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Optional assignment', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Save assignment', exact: true }).click();
  await saved(page);
  expect((await readPlan(request, workspace)).plan.tasks.find(task => task.id === 'homework').optional).toBe(false);
  await expect(nextAction.getByRole('heading', { name: 'Problem set', exact: true })).toBeVisible();
});
