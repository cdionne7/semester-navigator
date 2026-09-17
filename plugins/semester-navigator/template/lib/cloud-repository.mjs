import { normalizePlan, createPlanService, seedFingerprint, PlanError } from './plan-model.mjs';

function principal(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 256) throw new PlanError('Sign in to open your saved semester.', 401);
  return value;
}
function profile(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,159}$/.test(value)) throw new PlanError('Choose a valid student profile.', 400);
  return value;
}
function intakeText(value, label, limit = 160) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) throw new PlanError('Add '+label+'.', 400);
  return value.trim();
}

export function createCloudRepository(db) {
  async function rowFor(userId, profileId) {
    return db.prepare('SELECT payload, revision, seed_payload AS seedPayload FROM cloud_student_plans WHERE owner_id = ? AND profile_id = ?')
      .bind(principal(userId), profile(profileId)).first();
  }
  function persistence(userId) {
    principal(userId);
    return {
      read: id => rowFor(userId, id),
      async write(row, baseRevision, isNew) {
        const result = isNew
          ? await db.prepare('INSERT INTO cloud_student_plans (owner_id, profile_id, payload, revision, seed_payload) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING RETURNING profile_id')
            .bind(userId, row.profileId, row.payload, row.revision, row.seedPayload).first()
          : await db.prepare('UPDATE cloud_student_plans SET payload = ?, revision = ?, seed_payload = ?, updated_at = CURRENT_TIMESTAMP WHERE owner_id = ? AND profile_id = ? AND revision = ? RETURNING profile_id')
            .bind(row.payload, row.revision, row.seedPayload, userId, row.profileId, baseRevision).first();
        return Boolean(result);
      },
    };
  }
  async function createFromPlan(userId, raw) {
    const plan = normalizePlan(raw);
    profile(plan.profileId);
    const seed = {...plan,revision:0,seedRevision:seedFingerprint(plan)};
    const saved = {...seed,revision:1};
    const inserted = await persistence(userId).write({profileId:plan.profileId,payload:JSON.stringify(saved),revision:1,seedPayload:JSON.stringify(seed)},0,true);
    if(!inserted)throw new PlanError('This student already has a cloud plan. Open it and preview an import instead of creating another copy.',409);
    return {plan:saved,revision:1};
  }
  return {
    async listPlans(userId) {
      const result = await db.prepare('SELECT profile_id, payload, revision, updated_at FROM cloud_student_plans WHERE owner_id = ? ORDER BY updated_at DESC, profile_id')
        .bind(principal(userId)).all();
      return result.results.map(row => {
        const plan = normalizePlan(JSON.parse(row.payload), row.profile_id);
        return {profileId:plan.profileId,name:plan.name,school:plan.school,semester:plan.semester,educationLevel:plan.educationLevel,timezone:plan.timezone,revision:row.revision,updatedAt:row.updated_at};
      });
    },
    async getPlan(userId, profileId) {
      const row = await rowFor(userId, profileId);
      if (!row) return null;
      return createPlanService(JSON.parse(row.seedPayload), persistence(userId)).load();
    },
    async savePlan(userId, profileId, input) {
      const row = await rowFor(userId, profileId);
      if (!row) throw new PlanError('This student plan is not available to this account.', 404);
      const current = normalizePlan(JSON.parse(row.payload), profileId);
      const incoming = normalizePlan(input?.plan, profileId);
      for (const key of ['name','school','semester','educationLevel']) {
        if (incoming[key] !== current[key]) throw new PlanError('Keep this student and term unchanged. Create a separate semester plan for a new student or term.', 409);
      }
      return createPlanService(JSON.parse(row.seedPayload), persistence(userId)).save(input);
    },
    async createPlan(userId, intake) {
      principal(userId);
      const name = intakeText(intake?.name,'your name');
      const school = intakeText(intake?.school,'your school');
      const semester = intakeText(intake?.semester,'your term');
      const timezone = intakeText(intake?.timezone,'your time zone',100);
      try { new Intl.DateTimeFormat('en',{timeZone:timezone}).format(); } catch { throw new PlanError('Choose a valid time zone, such as America/New_York.',400); }
      if (!['college','high-school','other'].includes(intake?.educationLevel)) throw new PlanError('Choose your school level.',400);
      // A retried initial save must select the same student/term, not create a
      // second empty plan. Authorization still comes from the owner predicate.
      const fingerprint=JSON.stringify([name,school,semester].map(value=>value.normalize('NFKC').trim().toLowerCase()));
      const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(fingerprint)));
      const profileId='student-'+Array.from(digest.slice(0,16)).map(n=>n.toString(16).padStart(2,'0')).join('');
      const previous=await rowFor(userId,profileId);
      if(previous){
        const existing=normalizePlan(JSON.parse(previous.payload),profileId);
        if(existing.educationLevel!==intake.educationLevel)throw new PlanError('A semester with this student name, school and term already exists at a different school level. Open that plan and check the student details before continuing.',409);
        return createPlanService(JSON.parse(previous.seedPayload),persistence(userId)).load();
      }
      return createFromPlan(userId,{profileId,name,school,semester,timezone,educationLevel:intake.educationLevel,courses:[],tasks:[]});
    },
    async importPlan(userId, plan) {
      principal(userId);
      // Explicit one-time migration preserves the stable profile ID and private
      // work. Existing cloud records cannot be overwritten by this operation.
      return createFromPlan(userId,plan);
    },
  };
}

export function createOAuthD1Store(db) {
  return {
    async takeLimit({key,limit,expiresAt}) {
      const row=await db.prepare('INSERT INTO cloud_oauth_limits (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT (key) DO UPDATE SET count = count + 1 WHERE count < ? RETURNING count')
        .bind(key,expiresAt,limit).first();
      return Boolean(row);
    },
    async cleanupExpired(now,limit) {
      // Bound each statement independently; the service supplies a small cap.
      const cap=Math.max(1,Math.min(100,Math.trunc(limit)));
      await db.prepare('DELETE FROM cloud_oauth_records WHERE (kind, key) IN (SELECT kind, key FROM cloud_oauth_records WHERE expires_at IS NOT NULL AND expires_at <= ? LIMIT ?)').bind(now,cap).run();
      await db.prepare('DELETE FROM cloud_oauth_limits WHERE key IN (SELECT key FROM cloud_oauth_limits WHERE expires_at IS NOT NULL AND expires_at <= ? LIMIT ?)').bind(now,cap).run();
    },
    async put(record) {
      await db.prepare('INSERT INTO cloud_oauth_records (kind, key, value, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT (kind, key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at')
        .bind(record.kind,record.key,record.value,record.expiresAt).run();
    },
    async get(kind,key) {
      return db.prepare('SELECT kind, key, value, expires_at AS expiresAt FROM cloud_oauth_records WHERE kind = ? AND key = ?').bind(kind,key).first();
    },
    async consume(kind,key,expectedValue) {
      return Boolean(await db.prepare('DELETE FROM cloud_oauth_records WHERE kind = ? AND key = ? AND value = ? RETURNING key').bind(kind,key,expectedValue).first());
    },
    async delete(kind,key) { await db.prepare('DELETE FROM cloud_oauth_records WHERE kind = ? AND key = ?').bind(kind,key).run(); },
  };
}
