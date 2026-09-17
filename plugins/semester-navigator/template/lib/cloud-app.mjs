import { createCloudRepository, createOAuthD1Store } from './cloud-repository.mjs';
import { createOAuthService } from './cloud-oauth.mjs';
import { handleCloudMcp, CLOUD_SKILL_TEXT, CLOUD_TOOLS } from './cloud-tools.mjs';
import { PlanError } from './plan-model.mjs';
import { handleCloudAcceptance } from './cloud-acceptance.mjs';

const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const headers = {'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'same-origin'};
const json = (body,status=200) => Response.json(body,{status,headers});
const page = (title,body,status=200) => new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · Semester Navigator</title><link rel="stylesheet" href="/cloud.css"></head><body><main class="cloud-shell"><a href="/cloud" class="brand">SEMESTER NAVIGATOR</a>${body}</main></body></html>`,{status,headers:{...headers,'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'self'; style-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'"}});
const redirect = path => new Response(null,{status:303,headers:{...headers,location:path}});
export async function cloudAccountKey(userId) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(userId)))).map(n=>n.toString(16).padStart(2,'0')).join('');
}
function configuredOrigin(env) {
  try {
    const url = new URL(env.SEMESTER_CLOUD_ORIGIN);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
}
async function limitedBody(request,limit=4_000_000) {
  if (Number(request.headers.get('content-length') || 0) > limit) throw new PlanError('This request is too large.',413);
  const reader=request.body?.getReader();
  if(!reader)return '';
  const chunks=[];let bytes=0;
  while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>limit){await reader.cancel();throw new PlanError('This request is too large.',413);}chunks.push(part.value);}
  const joined=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.byteLength;}
  return new TextDecoder().decode(joined);
}
function inputJson(raw) { try{return JSON.parse(raw);}catch{throw new PlanError('The request is not valid JSON.',400);} }
function sameOrigin(request,origin) {
  if(request.headers.get('origin')!==origin || request.headers.get('sec-fetch-site')==='cross-site')throw new PlanError('Return to your Semester Navigator dashboard before saving.',403);
}
function newPlanForm(accountKey,error='') {
  return `<h1>Your semester, on every device</h1><p>Save one plan for your classes. Open it here or ask Semester Navigator in ChatGPT on your phone or computer.</p>${error?`<p role="alert">${escape(error)}</p>`:''}<form method="post" action="/api/cloud/plans"><input type="hidden" name="accountKey" value="${escape(accountKey)}"><label>Your name<input required name="name" maxlength="160" autocomplete="given-name"></label><label>School<input required name="school" maxlength="160"></label><label>Term<input required name="semester" maxlength="160" placeholder="Fall 2026"></label><label>School level<select name="educationLevel"><option value="college">College</option><option value="high-school">High school</option><option value="other">Other</option></select></label><label>Time zone<input required name="timezone" value="America/New_York" maxlength="100"></label><p class="fine">This saves a private, empty plan for the student shown above. ChatGPT will help you connect school sources next. A shared ChatGPT account can access each student's plan on that account.</p><button type="submit">Create my semester</button></form><p><a href="/cloud">Back to saved semesters</a></p>`;
}

/** Public metadata and OAuth transport; all student data requires a principal.
 * Production identity headers are provided and sanitized by the Sites edge.
 * Never enable this handler behind an untrusted direct origin that accepts
 * user-supplied oai-authenticated-user-* headers.
 */
export async function handleCloudApp(request,env) {
  const origin=configuredOrigin(env);
  if(!origin || !env.DB)return json({error:'Cloud Semester Navigator is not configured yet.'},503);
  const url=new URL(request.url), path=url.pathname;
  if(url.origin!==origin)return json({error:'Use the published Semester Navigator address.'},403);
  const repository=createCloudRepository(env.DB);
  const oauth=createOAuthService({origin,store:createOAuthD1Store(env.DB)});
  const userId=request.headers.get('oai-authenticated-user-id');
  const userEmail=request.headers.get('oai-authenticated-user-email');
  const user=userId && userEmail ? {userId,email:userEmail} : null;
  try {
    if(path==='/health')return json({service:'semester-navigator-cloud',ready:true});
    if(path==='/.well-known/oauth-protected-resource' || path==='/.well-known/oauth-protected-resource/api/semester-mcp')return oauth.resourceMetadata(request);
    if(path==='/.well-known/oauth-authorization-server')return oauth.authorizationMetadata(request);
    if(path==='/oauth/register')return oauth.register(request);
    if(path==='/oauth/token')return oauth.token(request);
    if(path==='/oauth/revoke')return oauth.revoke(request);
    if(path==='/api/semester-mcp'){
      const auth=await oauth.authenticate(request);
      if(!auth.ok)return auth.response;
      return handleCloudMcp(request,{principal:{userId:auth.userId,scopes:auth.scopes},repository,origin});
    }
    if(path==='/oauth/authorize'){
      if(!user)return redirect('/signin-with-chatgpt?return_to='+encodeURIComponent(path+url.search));
      return oauth.authorize(request,{userId:user.userId});
    }
    if(path==='/cloud.css' || path==='/favicon.svg' || /^\/assets\/[A-Za-z0-9_-]+\.(js|css)$/.test(path)){
      if(!['GET','HEAD'].includes(request.method))return json({error:'Method not allowed.'},405);
      const assetPath=path.startsWith('/assets/')?'/dashboard'+path:path;
      return env.ASSETS.fetch(new Request(new URL(assetPath,origin),{method:request.method}));
    }
    if(!user){
      if(path.startsWith('/api/'))return json({error:'Sign in to your Semester Navigator account.'},401);
      return page('Sign in',`<h1>Your semester, wherever you are</h1><p>One saved plan for your classes, assignments and next steps.</p><a class="button" href="/signin-with-chatgpt?return_to=${encodeURIComponent('/cloud'+url.search)}" target="_top">Sign in with ChatGPT</a><p class="fine">Your school sign-in is a separate connection. Semester Navigator never asks for your password in chat.</p>`);
    }
    const accountKey=await cloudAccountKey(user.userId);
    if(path.startsWith('/acceptance/'))return handleCloudAcceptance(request,{env,user,accountKey,origin,page,json,limitedBody});
    const profileId=url.searchParams.get('profileId');
    if(path==='/api/profile' || path==='/api/runtime' || path==='/api/plan'){
      if(!profileId)return json({error:'Choose a student first.'},400);
      if(request.method!=='GET' && !(path==='/api/plan' && request.method==='PUT'))return json({error:'Method not allowed.'},405);
      if(path==='/api/plan' && request.headers.get('x-semester-account-key')!==accountKey)return json({error:'Your signed-in account changed. Reopen the student plan.'},403);
      if(request.method==='PUT')sameOrigin(request,origin);
      const current=await repository.getPlan(user.userId,profileId);
      if(!current)return json({error:'This student plan is not available to this account.'},404);
      const dashboardUrl=origin+'/cloud?profileId='+encodeURIComponent(profileId);
      if(request.method==='GET'){
        if(path==='/api/runtime')return json({mode:'cloud',profileId,dashboardUrl,serviceUrl:origin,accountKey});
        if(path==='/api/profile')return json({plan:current.plan,cloud:{apiUrl:'/api/plan?profileId='+encodeURIComponent(profileId),accountKey,dashboardUrl,serviceUrl:origin}});
        return json({...current,accountKey});
      }
      if(path==='/api/plan' && request.method==='PUT'){
        const result=await repository.savePlan(user.userId,profileId,inputJson(await limitedBody(request)));
        return json({...result,accountKey});
      }
      return json({error:'Method not allowed.'},405);
    }
    if(path==='/api/cloud/plans'){
      if(request.method==='GET')return json({plans:await repository.listPlans(user.userId),accountKey});
      if(request.method!=='POST')return json({error:'Method not allowed.'},405);
      sameOrigin(request,origin);
      const raw=await limitedBody(request,16_000);
      const isJson=request.headers.get('content-type')?.startsWith('application/json');
      const intake=isJson?inputJson(raw):Object.fromEntries(new URLSearchParams(raw));
      if((isJson?request.headers.get('x-semester-account-key'):intake.accountKey)!==accountKey)return json({error:'Your signed-in account changed. Reopen the semester setup before saving.'},403);
      const result=await repository.createPlan(user.userId,intake);
      return isJson?json({...result,accountKey},201):redirect('/cloud?profileId='+encodeURIComponent(result.plan.profileId));
    }
    if(path==='/api/cloud/import'){
      if(request.method!=='POST')return json({error:'Method not allowed.'},405);
      sameOrigin(request,origin);
      if(request.headers.get('x-semester-account-key')!==accountKey)return json({error:'Reopen your signed-in student list before importing.'},403);
      return json({...await repository.importPlan(user.userId,inputJson(await limitedBody(request))),accountKey},201);
    }
    if(path==='/cloud/new')return page('Create a semester',newPlanForm(accountKey));
    if(path==='/cloud/guide'){
      if(request.method!=='GET')return json({error:'Method not allowed.'},405);
      const selected=profileId?await repository.getPlan(user.userId,profileId):null;
      if(profileId&&!selected)return json({error:'Choose a semester saved to this account.'},404);
      const currentPlan=selected?`<h2>Current saved plan</h2><p>Signed in as ${escape(user.email)}. Selected student: ${escape(selected.plan.name)}, ${escape(selected.plan.semester)}. Saved revision ${selected.revision}. This is a read-only snapshot; return here after a save for fresh readback.</p><details open><summary>Read the selected saved plan</summary><pre>${escape(JSON.stringify(selected.plan,null,2))}</pre></details><p><a href="/cloud?profileId=${encodeURIComponent(profileId)}">Return to this student's dashboard</a></p>`:'';
      const contract=CLOUD_TOOLS.find(tool=>tool.name==='save_semester_plan').inputSchema.properties.plan;
      return page('Assistant setup reference',`<h1>Assistant setup reference</h1><p>For ChatGPT helping a student use this saved cloud plan. Read these instructions before school setup or importing coursework through the browser.</p><h2>Using the dashboard when tools are unavailable</h2><p>Verify the signed-in account on Your saved semesters, then select the intended student and term. Use this guide with the same profileId shown in the selected dashboard address to read the current saved plan below; no download is needed. Export backup remains available for a separate backup. Its profileId and stable record IDs must remain unchanged. Do not inspect another student's full plan.</p><p>Prepare a bare JSON plan using the contract below, containing the selected profileId and only observed facts. Open Import plan, paste that JSON, review the preview, and apply the import under the student's applicable approval. Wait for All changes saved, reload the selected profile, and verify the actual changed fields. A save conflict requires reading the latest plan and reconciling it; do not discard the student's pending work.</p><p>Source checks need actual identity verification, timestamps and evidence. Mark executionContext as desktop when using a desktop browser, cloud only when using an actual cloud browser or connector. Save after a first useful deadline or an interrupted check, then continue remaining scopes. Neither a source login nor an empty saved plan completes school setup.</p>${currentPlan}<h2>Planning and source instructions</h2><pre>${escape(CLOUD_SKILL_TEXT)}</pre><h2>JSON import contract</h2><p>All listed keys are supported; only profileId is required at the top level. Omitted existing records and student notes are retained. Use existing IDs for updates. Unknown dueAt is null; dates without a published time stay YYYY-MM-DD. Course coverage uses courseId null for the roster, and each saved course ID for its specific scopes.</p><pre>${escape(JSON.stringify(contract,null,2))}</pre><p><a href="/cloud">Your semesters</a></p>`);
    }
    if(path==='/cloud/connect'){
      const selected=profileId?await repository.getPlan(user.userId,profileId):null;
      if(profileId&&!selected)return json({error:'Choose a semester saved to this account.'},404);
      const dashboard=origin+'/cloud'+(selected?'?profileId='+encodeURIComponent(profileId):'');
      const prompt=`Use Semester Navigator with my saved cloud plan at ${dashboard}. ${selected?`Select profile ${JSON.stringify(profileId)} for ${selected.plan.name}, ${selected.plan.semester}.`:'List my saved semesters and ask which student and term to use before reading coursework.'} My computer may be off. Use the connected Semester Navigator tools when available. Otherwise open this dashboard in ChatGPT Work's cloud browser and read ${origin}/cloud/guide${selected?'?profileId='+encodeURIComponent(profileId):''} for the saved plan, setup and import contract. Let me handle protected sign-in. Verify the account, student and term. Read the saved plan before changing it, save approved changes there and read them back. Do not create a separate local plan or require Remote. Show one next action and the source check time. Help me connect my school's actual tools in this cloud session, one question or sign-in step at a time. If this chat lacks the necessary tools, explain the exact next step without claiming a connection or save.`;
      return page('Chat with your semester',`<h1>Chat with your semester</h1><p>Copy this request into ChatGPT on your phone or computer. Select Semester Navigator if it is connected. Choose Astra when available.</p><label>Request to copy<textarea readonly rows="10">${escape(prompt)}</textarea></label><p>If the plugin is unavailable, use <strong>Work</strong> in ChatGPT. It can open this dashboard in its cloud browser when that feature is available to your account. Complete any protected sign-in yourself, then ask it to continue.</p><p class="fine">Your plan lives here. A new chat must select the saved student; this link cannot automatically select a ChatGPT project or model. School sign-ins in the cloud are separate from your desktop browser.</p><details><summary>Connect the cloud plugin for acceptance testing</summary><p>On ChatGPT web, enable Developer mode in Settings → Security and login if available. In Plugins, add Semester Navigator using OAuth at:</p><code>${escape(origin+'/api/semester-mcp')}</code><p>Follow the protected sign-in and approve the plan permissions. In a new chat, select Semester Navigator and ask it to list your saved semesters. A repository installation alone does not connect your phone.</p><p class="fine">This deployment is an acceptance candidate, not a public-directory plugin. Private hosting may block the connector until the supported connection is verified. A failed connection does not erase the saved dashboard.</p></details><p><a href="${escape(dashboard)}">Return to your semester</a></p>`);
    }
    if(path==='/' || path==='/cloud'){
      if(profileId){
        if(!await repository.getPlan(user.userId,profileId))return page('Plan unavailable','<h1>This semester is not available</h1><p>Choose a plan saved to your signed-in account.</p><a href="/cloud">Your semesters</a>',404);
        const asset=await env.ASSETS.fetch(new Request(new URL('/dashboard/index.html',origin)));
        if(!asset.ok)return json({error:'The dashboard is unavailable. Your plan remains saved.'},503);
        return new Response(await asset.text(),{headers:{...headers,'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'self'; base-uri 'none'; form-action 'self'"}});
      }
      const plans=await repository.listPlans(user.userId);
      return page('Your semesters',`<h1>Your saved semesters</h1><p>Choose the student and term before working. These plans stay available when your computer is off.</p><div class="student-list">${plans.map(plan=>`<a class="student-card" href="/cloud?profileId=${encodeURIComponent(plan.profileId)}"><strong>${escape(plan.name)}</strong><span>${escape(plan.semester)} · ${escape(plan.school)}</span></a>`).join('')||'<p>No semester plans saved yet.</p>'}</div><div class="actions"><a class="button" href="/cloud/new">Create a semester</a><a href="/cloud/connect">Connect ChatGPT</a></div><p class="fine">Signed in as ${escape(user.email)}. People sharing this account can open its student plans.</p><a href="/signout-with-chatgpt?return_to=%2Fcloud" target="_top">Sign out</a>`);
    }
    return page('Not found','<h1>This page is not available</h1><a href="/cloud">Your semesters</a>',404);
  } catch(error) {
    const status=error instanceof PlanError?error.status:500;
    const message=error instanceof PlanError?error.message:'The cloud plan could not be accessed. Your existing saved work has not been discarded.';
    if(path==='/api/cloud/plans' && user && request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))return page('Check your semester',newPlanForm(await cloudAccountKey(user.userId),message),status);
    return json({error:message},status);
  }
}
