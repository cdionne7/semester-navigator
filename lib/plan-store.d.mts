import type { Persistence } from './plan-model.mjs';
export function createFilePlanStore(root:string,profileId:string):Persistence & {recoverDeadLock():boolean};
