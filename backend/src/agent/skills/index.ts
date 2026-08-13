import type { Skill } from './types.js';
import { writeSqlQuerySkill } from './write-sql-query.js';

export type { Skill };

export const SKILLS: Skill[] = [writeSqlQuerySkill];

/**
 * If the user asks to write a query, the agent loads this skill first and
 * proceeds accordingly (see detailed_working/03-agent-runtime.md#skills).
 * Matching happens against the raw user query before the reasoning loop
 * starts, and matched directives get appended to the system instruction.
 */
export function matchSkills(query: string): Skill[] {
  return SKILLS.filter(skill => skill.matches(query));
}
