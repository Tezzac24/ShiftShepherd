import {
  TEAM_DESCRIPTION_MAX_LENGTH,
  TEAM_NAME_MAX_LENGTH,
} from '../../lib/supabase/services/teams';
import { eligibleInitialTeamAdmins } from '../../lib/appData/selectors';
import { UserProfile } from '../../types';

/** Validate the chosen identity against the full directory, not a display page. */
export function selectedInitialTeamAdmin(
  organisationId: string,
  users: UserProfile[],
  profileId: string | null,
): UserProfile | undefined {
  if (!profileId) return undefined;
  return eligibleInitialTeamAdmins(organisationId, users.filter((profile) => profile.id === profileId))[0];
}

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
