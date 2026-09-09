import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
async function capture(page,name){await mkdir('outputs',{recursive:true});await page.screenshot({path:resolve('outputs',name),fullPage:true});}
import {test,expect,openDashboard,saved,changeAvailability,readPlan} from './fixtures.mjs';

test.describe('first college setup',()=>{
 test.use({empty:true});
 test('student adds a class and assignments, saves sequential edits, and resumes the same data',async({page,request,workspace})=>{
   await openDashboard(page,workspace);await expect(page.getByText('No classes checked yet',{exact:true})).toBeVisible();
   await page.getByRole('button',{name:'Add my first class',exact:true}).click();await page.getByLabel('Class name',{exact:true}).fill('Economics');await page.getByLabel('Instructor',{exact:true}).fill('Instructor Example');await page.getByRole('button',{name:'Save class',exact:true}).click();await saved(page);
   await page.getByRole('button',{name:'Add assignment',exact:true}).click();await page.getByLabel('Assignment title',{exact:true}).fill('Read chapter one');await page.getByRole('button',{name:'Save assignment',exact:true}).click();await saved(page);
   await page.getByRole('button',{name:'All work',exact:true}).click();await expect(page.locator('.task-list').getByText('Deadline needs confirmation',{exact:false})).toBeVisible();
   await page.getByRole('button',{name:'Add assignment',exact:true}).click();await page.getByLabel('Assignment title',{exact:true}).fill('Short essay');await page.getByLabel('Due date',{exact:true}).fill('2026-09-09');await page.getByLabel('Due time (optional)',{exact:true}).fill('11:30');await page.getByLabel('Your notes',{exact:true}).fill('Start with the source reading.');await page.getByRole('button',{name:'Save assignment',exact:true}).click();await saved(page);
   const result=await readPlan(request,workspace);expect(result.revision).toBe(3);expect(result.plan.revision).toBe(3);expect(result.plan.tasks.find(t=>t.title==='Read chapter one').dueAt).toBeNull();expect(result.plan.tasks.find(t=>t.title==='Short essay').dueAt).toBe('2026-09-09T15:30:00.000Z');
   await page.reload();await saved(page);await page.getByRole('button',{name:'All work',exact:true}).click();await expect(page.locator('.task-list').getByRole('heading',{name:'Read chapter one',exact:true})).toBeVisible();await expect(page.locator('.task-list').getByRole('heading',{name:'Short essay',exact:true})).toBeVisible();
   await expect(page.getByRole('alert')).toHaveCount(0);await capture(page,'e2e-college-dashboard.png');
 });
});
test.describe('high school support',()=>{
 test.use({educationLevel:'high-school'});
 test('mobile dialog stays usable and rubric support carries the right student and source criteria',async({page,workspace})=>{
   await page.setViewportSize({width:390,height:844});await openDashboard(page,workspace);await page.getByRole('button',{name:'All work',exact:true}).click();await page.getByRole('button',{name:'Check my rubric',exact:true}).click();
   const dialog=page.getByRole('dialog',{name:'Continue in ChatGPT'});await expect(dialog).toBeVisible();await expect(page.getByLabel('Request for Semester Navigator')).toBeVisible();
   const prompt=await page.getByLabel('Request for Semester Navigator').inputValue();expect(prompt).toContain('High School Fixture (high-school, Fall 2026)');expect(prompt).toContain('Show the reasoning for each answer.');expect(prompt).toContain('Look for the rubric and my draft in my approved school sources first');
   await capture(page,'e2e-high-school-rubric-mobile.png');const box=await dialog.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(391);expect(box.height).toBeLessThanOrEqual(844);
   for(let index=0;index<8;index++){await page.keyboard.press('Tab');expect(await page.evaluate(()=>document.activeElement===document.body || !!document.activeElement?.closest('dialog'))).toBe(true);}
   await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(page.getByRole('button',{name:'Check my rubric',exact:true})).toBeFocused();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await capture(page,'e2e-high-school-dashboard-mobile.png');
 });
});
test('confirmed import updates source dates, keeps completion, and rejects another student',async({page,request,workspace})=>{
 await openDashboard(page,workspace);await page.getByRole('button',{name:'All work',exact:true}).click();await page.getByRole('button',{name:'Complete Problem set',exact:true}).click();await saved(page);
 const current=await readPlan(request,workspace);const imported=structuredClone(current.plan);imported.tasks[0].dueAt='2026-09-10';imported.tasks[0].state='next';imported.tasks.push({...imported.tasks[0],id:'unknown-import',title:'Reading to confirm',dueAt:null});
 await page.getByRole('button',{name:'Import plan',exact:true}).click();await page.getByText('Or paste the prepared plan',{exact:true}).click();await page.getByLabel('Plan JSON',{exact:true}).fill(JSON.stringify({...imported,profileId:'other-student'}));await page.getByRole('button',{name:'Preview import',exact:true}).click();await expect(page.getByRole('alert')).toContainText('different student');await expect(page.getByRole('button',{name:'Confirm import',exact:true})).toHaveCount(0);
 await page.getByRole('textbox',{name:'Plan JSON',exact:true}).fill(JSON.stringify(imported));await page.getByRole('button',{name:'Preview import',exact:true}).click();await expect(page.getByText('1 classes · 2 assignments · 1 unknown deadlines',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Confirm import',exact:true}).click();await saved(page);
 const result=await readPlan(request,workspace);expect(result.plan.tasks[0].state).toBe('done');expect(result.plan.tasks[0].dueAt).toBe('2026-09-10');expect(result.plan.tasks).toHaveLength(2);
 await page.getByLabel('Include completed').check();await expect(page.getByRole('button',{name:'Reopen Problem set',exact:true})).toBeVisible();
});
test('failed initial read never permits an empty-plan write',async({page,request,workspace})=>{
 const initial=await readPlan(request,workspace);await request.put(workspace.url+'/api/plan',{data:{plan:initial.plan,baseRevision:0}});let puts=0;
 await page.route('**/api/plan',async route=>{if(route.request().method()==='GET')await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Simulated read outage'})});else{puts++;await route.continue();}});
 await page.goto(workspace.url);await expect(page.getByText('Saved plan unavailable',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Preferences',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Add my first class',exact:true})).toBeDisabled();
 await page.unroute('**/api/plan');await page.getByRole('button',{name:'Load latest saved plan',exact:true}).click();await saved(page);expect(puts).toBe(0);const actual=await readPlan(request,workspace);expect(actual.revision).toBe(1);expect(actual.plan.tasks).toHaveLength(1);
});
test('failed write retains a dirty backup through reload and saves only after retry',async({page,request,workspace})=>{
 await openDashboard(page,workspace);let attempted=0;
 await page.route('**/api/plan',async route=>{if(route.request().method()==='PUT'){attempted++;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Simulated save outage'})});}else await route.continue();});
 await changeAvailability(page,'Tuesday work 4–9 PM');await expect(page.getByText('Changes waiting to save',{exact:true})).toBeVisible();
 await page.reload();await expect(page.getByText('Changes waiting to save',{exact:true})).toBeVisible();expect(attempted).toBe(1);await expect(page.getByText('Your availability notes: Tuesday work 4–9 PM',{exact:true})).toBeVisible();
 await page.unroute('**/api/plan');await page.getByRole('button',{name:'Save pending changes',exact:true}).click();await saved(page);const result=await readPlan(request,workspace);expect(result.revision).toBe(1);expect(result.plan.workHours).toBe('Tuesday work 4–9 PM');
 await page.reload();await saved(page);await expect(page.getByText('Your availability notes: Tuesday work 4–9 PM',{exact:true})).toBeVisible();
});
test('queued edits use the confirmed revision from the preceding save',async({page,request,workspace})=>{
 await openDashboard(page,workspace);let release;let intercepted;const held=new Promise(resolve=>release=resolve);const firstSent=new Promise(resolve=>intercepted=resolve);const sent=[];
 await page.route('**/api/plan',async route=>{if(route.request().method()==='PUT'){sent.push(route.request().postDataJSON());if(sent.length===1){intercepted();await held;}}await route.continue();});
 await changeAvailability(page,'First edit');await firstSent;await expect(page.getByText('Saving changes',{exact:true})).toBeVisible();await changeAvailability(page,'Second edit while saving');release();await saved(page);
 expect(sent).toHaveLength(2);expect(sent.map(x=>[x.baseRevision,x.plan.revision])).toEqual([[0,0],[1,1]]);const actual=await readPlan(request,workspace);expect(actual.revision).toBe(2);expect(actual.plan.workHours).toBe('Second edit while saving');
});
test('another tab cannot overwrite a newer save, and its conflicting copy can be exported',async({page,context,request,workspace})=>{
 await openDashboard(page,workspace);const other=await context.newPage();await openDashboard(other,workspace);
 await changeAvailability(page,'Saved in first tab');await saved(page);await changeAvailability(other,'Unsaved second-tab version');await expect(other.getByText('Another saved version needs review',{exact:true})).toBeVisible();await expect(other.getByRole('button',{name:'Preferences',exact:true})).toBeDisabled();
 const actual=await readPlan(request,workspace);expect(actual.revision).toBe(1);expect(actual.plan.workHours).toBe('Saved in first tab');
 const downloadPromise=other.waitForEvent('download');await other.getByRole('button',{name:'Export my copy',exact:true}).click();const download=await downloadPromise;const exported=JSON.parse(await readFile(await download.path(),'utf8'));expect(exported.workHours).toBe('Unsaved second-tab version');
 other.once('dialog',dialog=>dialog.accept());await other.getByRole('button',{name:'Load latest saved plan',exact:true}).click();await saved(other);await expect(other.getByText('Your availability notes: Saved in first tab',{exact:true})).toBeVisible();
});
