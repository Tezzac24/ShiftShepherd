import {
  TEAM_DESCRIPTION_MAX_LENGTH,
  TEAM_NAME_MAX_LENGTH,
} from '../../lib/supabase/services/teams';

export interface TeamFormErrors {
  name?: string;
  description?: string;
}

export interface ValidTeamForm {
  name: string;
  description: string | null;
}

export function validateTeamForm(
  nameInput: string,
  descriptionInput: string,
): { value: ValidTeamForm | null; errors: TeamFormErrors } {
  const name = nameInput.trim();
  const description = descriptionInput.trim();
  const errors: TeamFormErrors = {};
  if (!name) {
    errors.name = 'Enter a team name.';
  } else if (name.length > TEAM_NAME_MAX_LENGTH) {
    errors.name = `Keep the team name to ${TEAM_NAME_MAX_LENGTH} characters or fewer.`;
  }
  if (description.length > TEAM_DESCRIPTION_MAX_LENGTH) {
    errors.description = `Keep the description to ${TEAM_DESCRIPTION_MAX_LENGTH} characters or fewer.`;
  }
  return {
    value: Object.keys(errors).length === 0 ? { name, description: description || null } : null,
    errors,
  };
}
