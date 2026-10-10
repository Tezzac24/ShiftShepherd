import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { useAppData } from '../../../lib/appData/AppDataContext';
import { useAuth } from '../../../lib/auth/AuthContext';
import AnnouncementFormScreen from '../AnnouncementFormScreen';
import { AnnouncementImageDraft } from '../useAnnouncementImageDraft';
import { deferred, makeAuth, makeData, NOTICE, PROFILE, TEAM } from './noticeTestData';

const mockDiscardConfirm = jest.fn().mockResolvedValue(true);
jest.mock('../../../components/ConfirmDialog', () => ({ useConfirm: () => mockDiscardConfirm }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn();
const mockToast = jest.fn();
let mockParams: Record<string, string | string[] | undefined> = {};
jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: mockBack, replace: mockReplace, canGoBack: mockCanGoBack }) }));
jest.mock('../../../components/Toast', () => ({ useToast: () => mockToast }));
jest.mock('../../../lib/appData/AppDataContext', () => ({ useAppData: jest.fn() }));
jest.mock('../../../lib/auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
const mockFile = { base64: 'AA==', mimeType: 'image/png', fileSize: 1 };
const mockPick = jest.fn();
jest.mock('../useAnnouncementImageDraft', () => ({ useAnnouncementImageDraft: () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const [draft, setDraft] = React.useState<AnnouncementImageDraft>({ kind: 'unchanged' });
  return { draft, picking: false, pickImage: async () => { mockPick(); setDraft({ kind: 'replace', file: mockFile, previewUri: 'data:image/png;base64,AA==' }); },
    markRemoved: () => setDraft({ kind: 'remove' }) };
} }));
let data: ReturnType<typeof makeData>;
let auth: ReturnType<typeof makeAuth>;
beforeEach(() => {
  mockDiscardConfirm.mockReset().mockResolvedValue(true);
  jest.clearAllMocks(); data = makeData(); auth = makeAuth(); mockParams = {}; mockCanGoBack.mockReturnValue(true);
  (useAppData as jest.Mock).mockImplementation(() => data);
  (useAuth as jest.Mock).mockImplementation(() => auth);
});
const fill = (screen: ReturnType<typeof render>) => {
  fireEvent.changeText(screen.getByLabelText('Title'), '  New notice  ');
  fireEvent.changeText(screen.getByLabelText('Message'), '  Helpful details  ');
};
const more = (screen: ReturnType<typeof render>) => fireEvent.press(screen.getByRole('button', { name: /^More options\./ }));

test('cold edit shows loading and hydrates its row once without creating or overwriting a refreshed draft', () => {
  mockParams = { id: NOTICE.id }; data.announcements = []; data.announcementsLoading = true;
  const screen = render(<AnnouncementFormScreen />);
  expect(screen.getByText('Loading announcement…')).toBeTruthy(); expect(screen.queryByLabelText('Post announcement')).toBeNull();
  data.announcements = [NOTICE]; data.announcementsLoading = false; screen.rerender(<AnnouncementFormScreen />);
  expect(screen.getByLabelText('Title')).toHaveProp('value', NOTICE.title);
  fireEvent.changeText(screen.getByLabelText('Title'), 'My unsaved title');
  auth.accountStatus = 'loading'; screen.rerender(<AnnouncementFormScreen />);
  expect(screen.queryByLabelText('Title')).toBeNull();
  auth.accountStatus = 'ready'; data.announcements = [{ ...NOTICE, title: 'Server refresh' }]; screen.rerender(<AnnouncementFormScreen />);
  expect(screen.getByLabelText('Title')).toHaveProp('value', 'My unsaved title');
  expect(data.addAnnouncement).not.toHaveBeenCalled();
});

test('failed and missing edits retain a safe exit and never fall through to new announcement', () => {
  mockParams = { id: 'missing' }; data.announcements = []; data.announcementsError = 'Offline';
  const screen = render(<AnnouncementFormScreen />);
  expect(screen.getByText("Couldn't load this announcement")).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Retry announcement')); expect(data.refreshAnnouncements).toHaveBeenCalled();
  data.announcementsError = null; screen.rerender(<AnnouncementFormScreen />);
  expect(screen.getByText('Announcement unavailable')).toBeTruthy(); expect(screen.queryByLabelText('Title')).toBeNull();
  fireEvent.press(screen.getByLabelText('All announcements')); expect(mockReplace).toHaveBeenCalledWith('/announcements');
});

test('a team edit waits for its actual audience even when other team choices are cached', () => {
  mockParams = { id: NOTICE.id }; data.announcements = [{ ...NOTICE, team_id: 'waiting-team', audience: 'team' }]; data.teamsLoading = true;
  const screen = render(<AnnouncementFormScreen />);
  expect(screen.getByText('Loading announcement audiences…')).toBeTruthy(); expect(screen.queryByText('No permission')).toBeNull();
  data.teamsLoading = false; data.teams.push({ ...TEAM, id: 'waiting-team', name: 'Arriving team' }); screen.rerender(<AnnouncementFormScreen />);
  expect(screen.getByRole('button', { name: 'Who should see this?: Arriving team' })).toBeTruthy();
});

test('a replacement create deep link uses its own team and preset rather than an older draft', () => {
  mockParams = { teamId: TEAM.id, presetTitle: 'First notice', presetBody: 'First draft' };
  const screen = render(<AnnouncementFormScreen />);
  fireEvent.changeText(screen.getByLabelText('Title'), 'Old unsaved title');
  mockParams = { presetTitle: 'New church notice', presetBody: 'Second draft' };
  screen.rerender(<AnnouncementFormScreen />);
  expect(screen.getByLabelText('Title')).toHaveProp('value', 'New church notice');
  expect(screen.getByRole('button', { name: 'Who should see this?: Whole church' })).toBeTruthy();
});

test.each([['notice-1', 'second'], ''])('malformed edit ID never creates: %j', (id) => {
  mockParams = { id }; const screen = render(<AnnouncementFormScreen />);
  expect(screen.queryByLabelText('Post announcement')).toBeNull(); expect(screen.getByText('Announcement unavailable')).toBeTruthy();
});

test('team leaders receive only their active same-church audiences; a stale preset cannot post to the church', async () => {
  auth.user.orgRole = 'general_member';
  auth.user.memberships = [{ id: 'm', team_id: TEAM.id, user_id: PROFILE.id, role: 'team_leader', created_at: '' }];
  mockParams = { teamId: 'not-available', presetTitle: 'Cancellation', presetBody: 'A draft notice.' };
  data.teams.push({ ...TEAM, id: 'foreign', organisation_id: 'other' });
  const screen = render(<AnnouncementFormScreen />);
  expect(screen.getByLabelText('Title')).toHaveProp('value', 'Cancellation');
  fireEvent.press(screen.getByLabelText('Post announcement'));
  expect(data.addAnnouncement).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: /^Who should see this\?/ }));
  expect(screen.queryByRole('radio', { name: /^Whole church/ })).toBeNull();
  fireEvent.press(screen.getByRole('radio', { name: TEAM.name + '. Team announcement' }));
  fireEvent.press(screen.getByLabelText('Post announcement'));
  await waitFor(() => expect(data.addAnnouncement).toHaveBeenCalledWith(expect.objectContaining({ team_id: TEAM.id, audience: 'team' })));
});

test('validation provides field errors without losing the draft; save failure remains editable', async () => {
  data.addAnnouncement.mockRejectedValueOnce(new Error('No connection.'));
  const screen = render(<AnnouncementFormScreen />);
  fireEvent.press(screen.getByLabelText('Post announcement'));
  expect(screen.getByText('Please check these details')).toBeTruthy();
  expect(data.addAnnouncement).not.toHaveBeenCalled();
  fill(screen); fireEvent.press(screen.getByLabelText('Post announcement'));
  expect(await screen.findByText('No connection.')).toBeTruthy();
  expect(screen.getByText('Couldn’t post announcement')).toBeTruthy();
  expect(screen.getByLabelText('Title')).toHaveProp('value', '  New notice  ');
  fireEvent.press(screen.getByLabelText('Post announcement'));
  await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
  expect(data.addAnnouncement).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'New notice', body: 'Helpful details', audience: 'church', image_url: null }));
});

test('a failed edit clearly refers to unsaved changes and retains the service error and draft', async () => {
  mockParams = { id: NOTICE.id }; data.updateAnnouncement.mockRejectedValue(new Error('No connection.'));
  const screen = render(<AnnouncementFormScreen />);
  fireEvent.changeText(screen.getByLabelText('Title'), 'Retained edit'); fireEvent.press(screen.getByLabelText('Save changes'));
  expect(await screen.findByText('Couldn’t save changes')).toBeTruthy();
  expect(screen.getByText('No connection.')).toBeTruthy();
  expect(screen.getByLabelText('Title')).toHaveProp('value', 'Retained edit'); expect(data.addAnnouncement).not.toHaveBeenCalled();
});

test('edit retains pin and unresolved linked-event values through an ordinary text save', async () => {
  mockParams = { id: NOTICE.id }; data.announcements = [{ ...NOTICE, pinned: true, linked_event_id: 'past-or-inaccessible' }];
  const screen = render(<AnnouncementFormScreen />); more(screen);
  expect(screen.getByRole('button', { name: 'Linked event (optional): Current linked event (details unavailable)' })).toBeTruthy();
  expect(screen.getByRole('switch', { checked: true })).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('Title'), 'Corrected title'); fireEvent.press(screen.getByLabelText('Save changes'));
  await waitFor(() => expect(data.updateAnnouncement).toHaveBeenCalledWith(NOTICE.id, expect.objectContaining({ pinned: true, linked_event_id: 'past-or-inaccessible' })));
  expect(data.addAnnouncement).not.toHaveBeenCalled();
});

test('image controls remain absent in demo and confirmed Cancel never writes', async () => {
  auth.authMode = 'demo'; const screen = render(<AnnouncementFormScreen />); more(screen);
  expect(screen.queryByLabelText('Add image')).toBeNull(); fill(screen);
  fireEvent.press(screen.getByLabelText('Cancel')); await waitFor(() => expect(mockBack).toHaveBeenCalled());
  expect(data.addAnnouncement).not.toHaveBeenCalled(); expect(data.setAnnouncementImage).not.toHaveBeenCalled();
});

test('text-saved image failure stays recoverable and retries only the image on the same posted id', async () => {
  data.announcementsLive = true; data.setAnnouncementImage.mockRejectedValueOnce(new Error('Image offline.'));
  const screen = render(<AnnouncementFormScreen />); fill(screen); more(screen);
  await act(async () => fireEvent.press(screen.getByLabelText('Add image')));
  fireEvent.press(screen.getByLabelText('Post announcement'));
  expect(await screen.findByText('Announcement posted')).toBeTruthy();
  expect(screen.getByText("Image wasn't saved")).toBeTruthy(); expect(mockBack).not.toHaveBeenCalled();
  auth.accountStatus = 'loading'; screen.rerender(<AnnouncementFormScreen />);
  expect(screen.getByText('Announcement posted')).toBeTruthy();
  expect(screen.getByText("Image wasn't saved")).toBeTruthy();
  expect(screen.getByText(/Image offline\./)).toBeTruthy();
  expect(screen.getByLabelText('Close')).toBeTruthy();
  expect(screen.queryByLabelText('Try image change again')).toBeNull();
  expect(screen.queryByLabelText('View announcement')).toBeNull();
  auth.accountStatus = 'ready'; screen.rerender(<AnnouncementFormScreen />);
  expect(screen.getByText('Announcement posted')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Try image change again'));
  await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
  expect(data.addAnnouncement).toHaveBeenCalledTimes(1); expect(data.updateAnnouncement).not.toHaveBeenCalled();
  expect(data.setAnnouncementImage).toHaveBeenCalledTimes(2);
  expect(data.setAnnouncementImage).toHaveBeenLastCalledWith('created-notice', mockFile);
});

test('failed image removal preserves the saved edit and lets the person view it without retrying text', async () => {
  mockParams = { id: NOTICE.id }; data.announcementsLive = true;
  data.announcements = [{ ...NOTICE, image_url: 'announcements/church/notice/photo.png' }];
  data.removeAnnouncementImage.mockRejectedValue(new Error('Removal offline.'));
  const screen = render(<AnnouncementFormScreen />); more(screen);
  fireEvent.press(screen.getByLabelText('Remove image')); fireEvent.press(screen.getByLabelText('Save changes'));
  expect(await screen.findByText("Image wasn't removed")).toBeTruthy();
  fireEvent.press(screen.getByLabelText('View announcement'));
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/announcements/[id]', params: { id: NOTICE.id } });
  expect(data.updateAnnouncement).toHaveBeenCalledTimes(1); expect(data.addAnnouncement).not.toHaveBeenCalled();
});

test('duplicate taps perform one text write and block image work until same-profile authority resolves', async () => {
  data.announcementsLive = true; const pending = deferred<typeof NOTICE>(); data.addAnnouncement.mockReturnValue(pending.promise);
  const screen = render(<AnnouncementFormScreen />); fill(screen); more(screen);
  await act(async () => fireEvent.press(screen.getByLabelText('Add image')));
  fireEvent.press(screen.getByLabelText('Post announcement')); fireEvent.press(screen.getByLabelText('Post announcement'));
  expect(data.addAnnouncement).toHaveBeenCalledTimes(1);
  auth.accountStatus = 'loading'; screen.rerender(<AnnouncementFormScreen />);
  await act(async () => pending.resolve(NOTICE));
  expect(data.setAnnouncementImage).not.toHaveBeenCalled(); expect(mockBack).not.toHaveBeenCalled();
  expect(screen.getByText('Announcement posted')).toBeTruthy();
  expect(screen.getByText('Your title, message and audience are saved.')).toBeTruthy();
  expect(screen.getByText('The image change has not been saved yet. It will continue when this check is complete.')).toBeTruthy();
  expect(screen.queryByText('Saving the image change…')).toBeNull();
  expect(screen.queryByLabelText('Cancel')).toBeNull();
  expect(screen.getByLabelText('Close')).toBeTruthy();
  auth.accountStatus = 'ready'; screen.rerender(<AnnouncementFormScreen />);
  await waitFor(() => expect(data.setAnnouncementImage).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
});

test('completed text stays visible during refresh and Close exits without a duplicate write', async () => {
  const pending = deferred<typeof NOTICE>(); data.addAnnouncement.mockReturnValue(pending.promise);
  const screen = render(<AnnouncementFormScreen />); fill(screen); fireEvent.press(screen.getByLabelText('Post announcement'));
  auth.accountStatus = 'loading'; screen.rerender(<AnnouncementFormScreen />);
  await act(async () => pending.resolve(NOTICE));
  expect(screen.getByText('Announcement posted')).toBeTruthy();
  expect(screen.getByText('You can close this screen or wait to continue.')).toBeTruthy();
  expect(screen.queryByText(/image change has not been saved/)).toBeNull();
  fireEvent.press(screen.getByLabelText('Close'));
  auth.accountStatus = 'ready'; screen.rerender(<AnnouncementFormScreen />);
  expect(mockBack).toHaveBeenCalledTimes(1); expect(data.addAnnouncement).toHaveBeenCalledTimes(1);
  expect(data.setAnnouncementImage).not.toHaveBeenCalled(); expect(mockToast).not.toHaveBeenCalled();
});

test('an in-flight image change stays truthful during refresh and its completion waits to navigate', async () => {
  data.announcementsLive = true; const pendingImage = deferred<void>(); data.setAnnouncementImage.mockReturnValue(pendingImage.promise);
  const screen = render(<AnnouncementFormScreen />); fill(screen); more(screen);
  await act(async () => fireEvent.press(screen.getByLabelText('Add image')));
  fireEvent.press(screen.getByLabelText('Post announcement'));
  await waitFor(() => expect(data.setAnnouncementImage).toHaveBeenCalledTimes(1));
  auth.accountStatus = 'loading'; screen.rerender(<AnnouncementFormScreen />);
  expect(screen.getByText('Announcement posted')).toBeTruthy();
  expect(screen.getByText('The image change is still in progress.')).toBeTruthy();
  await act(async () => pendingImage.resolve(undefined));
  expect(screen.getByText('You can close this screen or wait to continue.')).toBeTruthy();
  expect(screen.queryByText('The image change is still in progress.')).toBeNull(); expect(mockBack).not.toHaveBeenCalled();
  auth.accountStatus = 'ready'; screen.rerender(<AnnouncementFormScreen />);
  expect(mockBack).toHaveBeenCalledTimes(1); expect(data.addAnnouncement).toHaveBeenCalledTimes(1);
  expect(data.setAnnouncementImage).toHaveBeenCalledTimes(1);
});

test('closing a posted announcement with a pending image prevents follow-on work after refresh', async () => {
  data.announcementsLive = true; const pending = deferred<typeof NOTICE>(); data.addAnnouncement.mockReturnValue(pending.promise);
  const screen = render(<AnnouncementFormScreen />); fill(screen); more(screen);
  await act(async () => fireEvent.press(screen.getByLabelText('Add image')));
  fireEvent.press(screen.getByLabelText('Post announcement'));
  auth.accountStatus = 'loading'; screen.rerender(<AnnouncementFormScreen />);
  await act(async () => pending.resolve(NOTICE));
  fireEvent.press(screen.getByLabelText('Close'));
  auth.accountStatus = 'ready'; screen.rerender(<AnnouncementFormScreen />);
  expect(mockBack).toHaveBeenCalledTimes(1); expect(mockToast).not.toHaveBeenCalled();
  expect(data.addAnnouncement).toHaveBeenCalledTimes(1); expect(data.setAnnouncementImage).not.toHaveBeenCalled();
});

test.each(['profile', 'role'])('a known text result cannot survive a %s change while image work waits', async (boundary) => {
  data.announcementsLive = true; const pending = deferred<typeof NOTICE>(); data.addAnnouncement.mockReturnValue(pending.promise);
  const screen = render(<AnnouncementFormScreen />); fill(screen); more(screen);
  await act(async () => fireEvent.press(screen.getByLabelText('Add image')));
  fireEvent.press(screen.getByLabelText('Post announcement'));
  auth.accountStatus = 'loading'; screen.rerender(<AnnouncementFormScreen />);
  await act(async () => pending.resolve(NOTICE));
  expect(screen.getByText('Announcement posted')).toBeTruthy();
  if (boundary === 'profile') auth.user = { ...auth.user, profile: { ...PROFILE, id: 'replacement' } };
  else auth.user = { ...auth.user, orgRole: 'general_member' };
  auth.accountStatus = 'ready'; screen.rerender(<AnnouncementFormScreen />);
  expect(screen.queryByText('Announcement posted')).toBeNull();
  expect(data.setAnnouncementImage).not.toHaveBeenCalled(); expect(mockBack).not.toHaveBeenCalled(); expect(mockToast).not.toHaveBeenCalled();
});

test.each(['profile', 'role', 'route'])('old %s save completion cannot upload, navigate or toast', async (boundary) => {
  data.announcementsLive = true; const pending = deferred<typeof NOTICE>(); data.addAnnouncement.mockReturnValue(pending.promise);
  const screen = render(<AnnouncementFormScreen />); fill(screen); more(screen);
  await act(async () => fireEvent.press(screen.getByLabelText('Add image')));
  fireEvent.press(screen.getByLabelText('Post announcement'));
  if (boundary === 'profile') auth.user = { ...auth.user, profile: { ...PROFILE, id: 'replacement' } };
  if (boundary === 'role') auth.user = { ...auth.user, orgRole: 'general_member' };
  if (boundary === 'route') mockParams = { id: NOTICE.id };
  screen.rerender(<AnnouncementFormScreen />);
  await act(async () => pending.resolve(NOTICE));
  expect(data.setAnnouncementImage).not.toHaveBeenCalled(); expect(mockBack).not.toHaveBeenCalled(); expect(mockToast).not.toHaveBeenCalled();
});

test('a resolved role loss does not expose a new form and a cross-church edit is unavailable', () => {
  auth.user.orgRole = 'general_member'; const screen = render(<AnnouncementFormScreen />);
  expect(screen.getByText('No permission')).toBeTruthy(); expect(screen.queryByLabelText('Title')).toBeNull();
  auth.user.orgRole = 'church_admin'; mockParams = { id: NOTICE.id }; data.announcements = [{ ...NOTICE, organisation_id: 'other' }];
  screen.rerender(<AnnouncementFormScreen />);
  expect(screen.getByText('Announcement unavailable')).toBeTruthy();
});

test('a direct successful create has an explicit detail destination when no history exists', async () => {
  mockCanGoBack.mockReturnValue(false); const screen = render(<AnnouncementFormScreen />); fill(screen);
  fireEvent.press(screen.getByLabelText('Post announcement'));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: '/announcements/[id]', params: { id: 'created-notice' } }));
});

test.each(['Title', 'Message'])('keeps announcement changes to %s when discard is dismissed', async (field) => {
  mockDiscardConfirm.mockResolvedValue(false); mockParams = { id: NOTICE.id };
  const screen = render(<AnnouncementFormScreen />);
  fireEvent.changeText(screen.getByLabelText(field), 'My unsaved notice');
  await act(async () => fireEvent.press(screen.getByLabelText('Cancel')));
  expect(mockDiscardConfirm).toHaveBeenCalledWith(expect.objectContaining({ message: 'Your announcement changes will not be saved.' }));
  expect(screen.getByDisplayValue('My unsaved notice')).toBeTruthy();
  expect(mockBack).not.toHaveBeenCalled(); expect(data.updateAnnouncement).not.toHaveBeenCalled();
});

test('confirms discarding a selected announcement image even when text is unchanged', async () => {
  data.announcementsLive = true;
  mockDiscardConfirm.mockResolvedValue(false); mockParams = { id: NOTICE.id };
  const screen = render(<AnnouncementFormScreen />); more(screen);
  await act(async () => fireEvent.press(screen.getByLabelText('Add image')));
  await act(async () => fireEvent.press(screen.getByLabelText('Cancel')));
  expect(mockDiscardConfirm).toHaveBeenCalledTimes(1); expect(mockBack).not.toHaveBeenCalled();
  expect(data.setAnnouncementImage).not.toHaveBeenCalled();
});
