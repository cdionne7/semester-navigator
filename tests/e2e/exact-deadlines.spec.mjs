import {test,expect,openDashboard,saved,readPlan} from './fixtures.mjs';

for(const deadline of [
  {name:'the offset-confirmed repeated daylight-saving hour',input:'2026-11-01T01:30:00-05:00',normalized:'2026-11-01T06:30:00.000Z',date:'2026-11-01',time:'01:30'},
  {name:'the source timestamp with seconds and milliseconds',input:'2026-09-11T19:00:30.123Z',normalized:'2026-09-11T19:00:30.123Z',date:'2026-09-11',time:'15:00'},
]){
  test(`editing only notes preserves ${deadline.name}`,async({page,request,workspace})=>{
    const initial=await readPlan(request,workspace);
    initial.plan.tasks[0].dueAt=deadline.input;
    const imported=await request.put(workspace.url+'/api/plan',{data:{plan:initial.plan,baseRevision:initial.revision}});
    expect(imported.status()).toBe(200);
    const before=await readPlan(request,workspace);
    const original=before.plan.tasks.find(task=>task.id==='homework');
    expect(original.dueAt).toBe(deadline.normalized);

    await openDashboard(page,workspace);
    await page.getByRole('button',{name:'All work',exact:true}).click();
    const assignment=page.locator('.task-list li').filter({has:page.getByRole('heading',{name:'Problem set',exact:true})});
    await assignment.getByRole('button',{name:'Edit',exact:true}).click();
    await expect(page.getByLabel('Due date',{exact:true})).toHaveValue(deadline.date);
    await expect(page.getByLabel('Due time (optional)',{exact:true})).toHaveValue(deadline.time);
    const notes='Check my reasoning before submitting. The source deadline has not changed.';
    await page.getByRole('textbox',{name:'Your notes',exact:true}).fill(notes);
    await page.getByRole('button',{name:'Save assignment',exact:true}).click();
    await expect(page.getByRole('dialog',{name:'Edit assignment',exact:true})).toHaveCount(0);
    await saved(page);
    await expect(page.getByRole('alert')).toHaveCount(0);

    const after=await readPlan(request,workspace);
    expect(after.revision).toBe(before.revision+1);
    expect(after.plan.tasks.find(task=>task.id==='homework')).toEqual({...original,notes});
    await page.reload();
    await saved(page);
    await page.getByRole('button',{name:'All work',exact:true}).click();
    await assignment.getByRole('button',{name:'Edit',exact:true}).click();
    await expect(page.getByRole('textbox',{name:'Your notes',exact:true})).toHaveValue(notes);
    expect((await readPlan(request,workspace)).plan.tasks.find(task=>task.id==='homework').dueAt).toBe(deadline.normalized);
  });
}
