import {test,expect,openDashboard,saved,readPlan} from './fixtures.mjs';
import {recordSourceCheck,expireSourceAccess} from '../../lib/plan-model.mjs';

test('a partial browser reconnect import uses the saved source contract and clears resolved errors',async({page,request,workspace})=>{
  const initial=await readPlan(request,workspace);
  let plan=recordSourceCheck(initial.plan,{profileId:initial.plan.profileId,source:{id:'school',title:'School portal',provider:'brightspace',accessMode:'browser',connection:{state:'verified',tool:'synthetic-browser',evidence:'Synthetic exposed school identity checked.',checkedAt:'2026-09-09T14:00:00Z',expectedIdentity:'student@example.edu',observedIdentity:'student@example.edu',identityStorageApproved:true}}});
  plan=expireSourceAccess(plan,{profileId:plan.profileId,sourceId:'school',checkedAt:'2026-09-09T15:00:00Z',reason:'School session expired.'});
  expect((await request.put(workspace.url+'/api/plan',{data:{plan,baseRevision:initial.revision}})).status()).toBe(200);
  await openDashboard(page,workspace);
  await page.getByRole('button',{name:'Import plan',exact:true}).click();
  await page.getByText('Or paste the prepared plan',{exact:true}).click();
  const patch={profileId:plan.profileId,sources:[{id:'school',connection:{state:'verified',checkedAt:'2026-09-09T16:00:00Z',evidence:'Synthetic intended school identity reverified.',lastError:'',nextAction:''}}]};
  await page.getByLabel('Plan JSON',{exact:true}).fill(JSON.stringify(patch));
  await page.getByRole('button',{name:'Preview import',exact:true}).click();
  await page.getByRole('button',{name:'Confirm import',exact:true}).click();await saved(page);
  await page.reload();await saved(page);
  const actual=await readPlan(request,workspace);
  expect(actual.plan.sources[0].connection).toMatchObject({state:'verified',lastError:'',nextAction:'',expectedIdentity:'student@example.edu'});
  expect(actual.plan.sources[0].accessMode).toBe('browser');expect(actual.plan.tasks).toEqual(plan.tasks);
});

test('an import preview made during a save uses the confirmed revision when accepted',async({page,request,workspace})=>{
  await openDashboard(page,workspace);
  let release;
  let intercepted;
  const held=new Promise(resolve=>release=resolve);
  const firstSent=new Promise(resolve=>intercepted=resolve);
  const sent=[];
  await page.route('**/api/plan',async route=>{
    if(route.request().method()==='PUT'){
      sent.push(route.request().postDataJSON());
      if(sent.length===1){intercepted();await held;}
    }
    await route.continue();
  });
  try {
    await page.getByRole('button',{name:'Add assignment',exact:true}).click();
    await page.getByLabel('Assignment title',{exact:true}).fill('Read the instructor handout');
    await page.getByRole('button',{name:'Save assignment',exact:true}).click();
    await firstSent;
    await expect(page.getByText('Saving changes',{exact:true})).toBeVisible();

    // Capture the same plan visible to the student before its first save finishes.
    const imported=structuredClone(sent[0].plan);
    imported.tasks[0].dueAt='2026-09-11';
    imported.tasks.push({...imported.tasks[0],id:'source-reading',title:'Imported source reading',dueAt:'2026-09-14'});
    await page.getByRole('button',{name:'Import plan',exact:true}).click();
    await page.getByText('Or paste the prepared plan',{exact:true}).click();
    await page.getByLabel('Plan JSON',{exact:true}).fill(JSON.stringify(imported));
    await page.getByRole('button',{name:'Preview import',exact:true}).click();
    await expect(page.getByText('1 classes · 3 assignments · 0 optional · 1 unknown required deadlines',{exact:true})).toBeVisible();

    release();
    await saved(page);
    // The preview remains open with its old revision while the current plan is now revision 1.
    const firstSaved=await readPlan(request,workspace);
    expect(firstSaved.revision).toBe(1);
    expect(firstSaved.plan.tasks).toHaveLength(2);
    const importSaved=page.waitForResponse(response=>response.url()===workspace.url+'/api/plan' && response.request().method()==='PUT');
    await page.getByRole('button',{name:'Confirm import',exact:true}).click();
    expect((await importSaved).status()).toBe(200);
    expect(sent).toHaveLength(2);
    expect(sent.map(item=>[item.baseRevision,item.plan.revision])).toEqual([[0,0],[1,1]]);
    expect(sent[1].plan.seedRevision).toBe(firstSaved.plan.seedRevision);
    await saved(page);
    await expect(page.getByRole('alert')).toHaveCount(0);
    const actual=await readPlan(request,workspace);
    expect(actual.revision).toBe(2);
    expect(actual.plan.tasks).toHaveLength(3);
    expect(actual.plan.tasks.find(task=>task.id==='homework').dueAt).toBe('2026-09-11');
    expect(actual.plan.tasks.find(task=>task.title==='Read the instructor handout').dueAt).toBeNull();
    expect(actual.plan.tasks.find(task=>task.id==='source-reading').dueAt).toBe('2026-09-14');
    await page.reload();
    await saved(page);
    await page.getByRole('button',{name:'All work',exact:true}).click();
    await expect(page.locator('.task-list').getByRole('heading',{name:'Read the instructor handout',exact:true})).toBeVisible();
    await expect(page.locator('.task-list').getByRole('heading',{name:'Imported source reading',exact:true})).toBeVisible();
  } finally {release();}
});
