import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { colors, spacing } from "../../../constants/theme";
import { AppText } from "../../components/AppText";
import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/Button";
import { useConfirm } from "../../components/ConfirmDialog";
import { ListGroup } from "../../components/ListGroup";
import { ListRow } from "../../components/ListRow";
import { OrganisationHeader } from "../../components/OrganisationHeader";
import { PageHeading } from "../../components/PageHeading";
import { Screen } from "../../components/Screen";
import { SectionHeader } from "../../components/SectionHeader";
import { useToast } from "../../components/Toast";
import { useAppData } from "../../lib/appData/AppDataContext";
import { useAuth, useRequiredUser } from "../../lib/auth/AuthContext";
import {
  canManageOrganisationMembers,
  isChurchAdmin,
} from "../../lib/permissions";
import { useProfileAvatar } from "./useProfileAvatar";

const orgRoleLabels: Record<string, string> = {
  church_admin: "Church admin",
  announcement_manager: "Announcement manager",
  event_manager: "Event manager",
  general_member: "Church member",
};

export default function ProfileScreen() {
  const router = useRouter();
  const user = useRequiredUser();
  const {
    signOut,
    authMode,
    accountContext,
    accountStatus,
    isLoading,
    leaveOrganisation,
  } = useAuth();
  const data = useAppData();
  const confirm = useConfirm();
  const showToast = useToast();
  const { avatarUri } = useProfileAvatar();
  const [leavingOrganisation, setLeavingOrganisation] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [resetting, setResetting] = useState(false);
  const signOutRef = useRef<View>(null);
  const leaveRef = useRef<View>(null);
  const resetRef = useRef<View>(null);
  const accountPending = useRef(false);
  const resetPending = useRef(false);

  const authorityReady =
    !isLoading && (authMode !== "supabase" || accountStatus === "ready");
  const canEditProfile =
    authorityReady && authMode === "supabase" && !!user.supabaseProfileId;
  // Destructive context must come from the same resolved identity as the header,
  // never AppData's temporary demo organisation during live hydration.
  const activeOrganisation =
    accountContext?.account.active_profile_id === user.profile.id
      ? accountContext.organisations.find(
          (item) =>
            item.profile.id === user.profile.id &&
            item.organisation.id === user.profile.organisation_id,
        )?.organisation
      : undefined;
  const myTeams = data.teams.filter(
    (team) =>
      team.organisation_id === user.profile.organisation_id &&
      !team.archived_at &&
      data.memberships.some(
        (membership) =>
          membership.user_id === user.profile.id &&
          membership.team_id === team.id,
      ),
  );
  const membershipSummary = data.teamsLoading
    ? "Loading your memberships…"
    : data.teamsError
      ? "Open Teams to retry your memberships"
      : myTeams.length
        ? `You belong to ${myTeams.length} ${myTeams.length === 1 ? "team" : "teams"}`
        : "Find out how to take part in a team";

  const handleResetDemoData = async () => {
    if (authMode !== "demo" || resetPending.current) return;
    resetPending.current = true;
    try {
      const ok = await confirm({
        title: "Reset demo data",
        message:
          "This puts all announcements, events, rotas, songs and messages back to the original demo examples. Any changes you made in this demo will be removed.",
        confirmLabel: "Reset demo data",
        destructive: true,
        returnFocusRef: resetRef,
      });
      if (!ok) return;
      setResetting(true);
      await data.resetDemoData();
      showToast("All demo data has been restored to the original examples.");
    } catch {
      showToast("We couldn’t reset the demo data. Please try again.", "error");
    } finally {
      resetPending.current = false;
      setResetting(false);
    }
  };

  // Auth owns the destination and scope teardown for both account actions.
  const handleSignOut = async () => {
    if (accountPending.current) return;
    accountPending.current = true;
    try {
      const ok = await confirm({
        title: "Sign out?",
        message: "You can sign in again when you’re ready.",
        confirmLabel: "Sign out",
        destructive: false,
        returnFocusRef: signOutRef,
      });
      if (!ok) return;
      setSigningOut(true);
      await signOut();
    } catch (cause) {
      showToast(
        cause instanceof Error
          ? cause.message
          : "We couldn’t complete the sign out.",
        "error",
      );
    } finally {
      accountPending.current = false;
      setSigningOut(false);
    }
  };

  const handleLeaveOrganisation = async () => {
    if (
      accountPending.current ||
      leavingOrganisation ||
      authMode !== "supabase" ||
      !authorityReady ||
      !activeOrganisation
    )
      return;
    accountPending.current = true;
    try {
      const ok = await confirm({
        title: `Disconnect from ${activeOrganisation.name}?`,
        message: `${isChurchAdmin(user) ? "If you are the final church admin, another church admin must be appointed first. " : ""}This removes your app access to this church and its teams. Your church role, team memberships and notification registration for this church will be removed. Your profile, messages, rota history and account will be kept, along with access to any other churches. To reconnect, you’ll need a new invitation.`,
        confirmLabel: "Disconnect",
        destructive: true,
        returnFocusRef: leaveRef,
      });
      if (!ok) return;
      setLeavingOrganisation(true);
      await leaveOrganisation();
      showToast(`${activeOrganisation.name} has been disconnected from your account.`);
    } catch (cause) {
      showToast(
        cause instanceof Error
          ? cause.message
          : "We couldn’t disconnect this church.",
        "error",
      );
      setLeavingOrganisation(false);
    } finally {
      accountPending.current = false;
    }
  };

  return (
    <Screen safeTop contentStyle={styles.profileContent}>
      <OrganisationHeader />
      <PageHeading
        title="Profile"
        action={
          canEditProfile ? (
            <Button
              title="Edit"
              variant="ghost"
              icon="create-outline"
              onPress={() => router.push("/profile/edit")}
              accessibilityLabel="Edit profile"
              accessibilityHint="Change your name or profile photo"
              testID="edit-profile-action"
            />
          ) : undefined
        }
      />

      <View style={styles.identity}>
        <View style={styles.identityName}>
          <Avatar name={user.profile.full_name} uri={avatarUri} size={56} />
          <AppText variant="heading" style={styles.flex}>
            {user.profile.full_name}
          </AppText>
        </View>
        <AppText tone="secondary" selectable>
          {user.profile.email}
        </AppText>
        {user.profile.phone ? (
          <AppText tone="secondary" selectable>
            {user.profile.phone}
          </AppText>
        ) : null}
      </View>

      <View style={styles.section}>
        <SectionHeader title="Preferences" />
        <ListGroup>
          <ListRow
            icon="notifications-outline"
            title="Notification preferences"
            subtitle="Choose updates from this church"
            onPress={() => router.push("/settings/notifications")}
          />
        </ListGroup>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Your church" />
        <AppText tone="secondary">{orgRoleLabels[user.orgRole]}</AppText>
        <ListGroup>
          <ListRow
            icon="people-outline"
            title="Teams"
            subtitle={membershipSummary}
            onPress={() => router.push("/(tabs)/teams")}
          />
        </ListGroup>
      </View>

      {authorityReady &&
      authMode === "supabase" &&
      canManageOrganisationMembers(user) ? (
        <View style={styles.section}>
          <SectionHeader title="Manage church" />
          <ListGroup>
            <ListRow
              icon="people-circle-outline"
              title="Church members"
              subtitle="Manage access and roles"
              onPress={() => router.push("/organisations/members")}
            />
            <ListRow
              icon="mail-outline"
              title="Invitations"
              subtitle="Invite, resend or cancel"
              onPress={() => router.push("/organisations/invitations")}
            />
          </ListGroup>
        </View>
      ) : null}

      <View style={styles.account}>
        <SectionHeader title="Account" />
        <Button
          ref={signOutRef}
          title="Sign out"
          variant="secondary"
          icon="log-out-outline"
          onPress={() => void handleSignOut()}
          loading={signingOut}
          disabled={leavingOrganisation}
        />
        {authMode === "supabase" ? (
          <Button
            ref={leaveRef}
            title="Disconnect this church"
            variant="destructive"
            icon="exit-outline"
            onPress={() => void handleLeaveOrganisation()}
            loading={leavingOrganisation}
            disabled={signingOut || !authorityReady || !activeOrganisation}
            accessibilityHint="Removes access to this church and its teams. Your account, history and other churches are kept."
          />
        ) : null}
      </View>

      {authMode === "demo" ? (
        <View style={styles.section}>
          <SectionHeader title="Demo only" />
          <AppText variant="small" tone="secondary">
            You’re exploring example data. Reset removes changes made in
            this demo.
          </AppText>
          <Button
            ref={resetRef}
            title="Reset demo data"
            variant="ghost"
            icon="refresh-outline"
            onPress={() => void handleResetDemoData()}
            loading={resetting}
          />
        </View>
      ) : null}

      <View style={styles.help}>
        <AppText variant="label" headingLevel={2}>
          Need help?
        </AppText>
        <AppText variant="small" tone="secondary">
          For help with a team, a serving date or church access, speak to
          your team admin or church admin.
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileContent: { paddingBottom: spacing.lg },
  flex: { flex: 1, minWidth: 0 },
  identity: { gap: spacing.xs, paddingBottom: spacing.md },
  identityName: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  section: { gap: spacing.sm, marginBottom: spacing.sm },
  account: {
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  help: { gap: spacing.xs, marginTop: spacing.md },
});
