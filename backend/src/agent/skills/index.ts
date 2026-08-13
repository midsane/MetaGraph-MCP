import type { Skill } from './types.js';
import { writeSqlQuerySkill } from './write-sql-query.js';

export type { Skill };

export const SKILLS: Skill[] = [writeSqlQuerySkill];

/**
 * Skill loading step referenced in agent_runtime.md: "if user asks to write
 * a query -> ai agent loads this skills first and does task accordingly".
 * Matching happens against the raw user query before the reasoning loop
 * starts, and matched directives get appended to the system instruction.
 */
export function matchSkills(query: string): Skill[] {
  return SKILLS.filter(skill => skill.matches(query));
}
