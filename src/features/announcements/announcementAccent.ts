import { colors } from '../../../constants/theme';

/** Use the same name-derived RGB hex color on announcement cards and details. */
export function announcementAccentColor(teamName?: string): string {
  const name = teamName?.trim().toLowerCase();
  if (!name) return colors.accent;

  let hash = 2166136261;
  for (const character of name) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  return `#${(hash & 0xffffff).toString(16).padStart(6, '0')}`;
}
