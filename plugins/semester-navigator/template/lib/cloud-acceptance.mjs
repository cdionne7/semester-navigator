// Synthetic QA only. These routes are disabled unless the deployment explicitly
// enables acceptance mode, and use the already authenticated owner boundary.
import {handleCloudSchool,defaultCloudSchoolState} from '../tests/acceptance/cloud-school.mjs';
import {createOAuthD1Store} from './cloud-repository.mjs';

export async function handleCloudAcceptance(request,{env,user,accountKey,origin,page,json,limitedBody}){
  if(env.SEMESTER_ACCEPTANCE_MODE!=='true')return json({error:'Not found.'},404);
  const url=new URL(request.url),store=createOAuthD1Store(env.DB);
  const keyFor=student=>accountKey+':'+student;
  const readState=async(_owner,student)=>{
    const row=await store.get('acceptance-state',keyFor(student));
    return row?JSON.parse(row.value):defaultCloudSchoolState();
  };
  if(url.pathname.startsWith('/acceptance/school'))return handleCloudSchool(request,{
    ownerId:user.userId,enabled:true,readState,
    async recordRequest(_owner,entry){
      const now=Math.floor(Date.now()/1000);
      await store.put({kind:'acceptance-log',key:accountKey+':'+now+':'+crypto.randomUUID(),value:JSON.stringify(entry),expiresAt:now+7*86400});
    },
  });
  if(url.pathname==='/acceptance/log'&&request.method==='GET'){
    const result=await env.DB.prepare("SELECT value FROM cloud_oauth_records WHERE kind = 'acceptance-log' AND key LIKE ? ORDER BY key DESC LIMIT 500").bind(accountKey+':%').all();
    return json({entries:result.results.map(row=>JSON.parse(row.value))});
  }
  if(url.pathname!=='/acceptance/control')return json({error:'Not found.'},404);
  if(request.method==='POST'){
    if(request.headers.get('origin')!==origin || request.headers.get('sec-fetch-site')==='cross-site')return json({error:'Return to the acceptance control page.'},403);
    const fields=new URLSearchParams(await limitedBody(request,2000));
    if(fields.get('accountKey')!==accountKey)return json({error:'Account changed.'},403);
    const student=fields.get('student'),session=fields.get('session');
    if(!['college','high-school'].includes(student)||!['signed-in','protected-login','wrong-account','expired','blocked'].includes(session))return json({error:'Invalid fixture control.'},400);
    await store.put({kind:'acceptance-state',key:keyFor(student),value:JSON.stringify({session,revisedDeadline:fields.get('revisedDeadline')==='on',rosterPage2Blocked:fields.get('rosterPage2Blocked')==='on'}),expiresAt:Math.floor(Date.now()/1000)+7*86400});
    return new Response(null,{status:303,headers:{location:'/acceptance/control','cache-control':'no-store'}});
  }
  if(request.method!=='GET')return json({error:'Method not allowed.'},405);
  const forms=[];
  for(const student of ['college','high-school']){
    const state=await readState(user.userId,student);
    forms.push(`<form method="post"><h2>${student}</h2><input type="hidden" name="student" value="${student}"><input type="hidden" name="accountKey" value="${accountKey}"><label>Simulated school session<select name="session">${['signed-in','protected-login','wrong-account','expired','blocked'].map(value=>`<option${state.session===value?' selected':''}>${value}</option>`).join('')}</select></label><label><input type="checkbox" name="revisedDeadline"${state.revisedDeadline?' checked':''}>Revised announcement</label><label><input type="checkbox" name="rosterPage2Blocked"${state.rosterPage2Blocked?' checked':''}>Block second roster page</label><button>Set fixture state</button></form>`);
  }
  return page('Acceptance controls','<h1>Evaluator controls</h1><p>Synthetic school only. No real school account is changed. Persona agents must use only the school pages they were given.</p>'+forms.join(''));
}
