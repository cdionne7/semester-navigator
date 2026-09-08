import type { Plan } from "./plan-model.mjs";
export function safeWebUrl(value: string): string;
export function localDueParts(value: string | null, timezone: string): {date:string,time:string};
export function dueFromLocal(date:string,time:string,timezone:string):string|null;
export function coachingPrompt(plan: Plan, mode: string, taskId?: string, courseId?: string): string;
export function calendarExport(plan: Plan, now?: Date): string;
