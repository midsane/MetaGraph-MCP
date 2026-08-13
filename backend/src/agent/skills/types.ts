export interface Skill {
  id: string;
  name: string;
  matches: (query: string) => boolean;
  directive: string;
}
