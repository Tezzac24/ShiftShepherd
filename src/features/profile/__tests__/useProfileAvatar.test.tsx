import { act, renderHook } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { useProfileAvatar } from '../useProfileAvatar';

const mockSetAvatar = jest.fn();
const mockRemoveAvatar = jest.fn();
const mockToast = jest.fn();
const mockConfirm = jest.fn();
let mockMode = 'supabase';
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(), requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(), launchImageLibraryAsync: jest.fn(),
}));
jest.mock('../../../lib/auth/AuthContext', () => ({
  useAuth: () => ({ authMode: mockMode }),
  useRequiredUser: () => ({ supabaseProfileId: 'profile', profile: { avatar_url: null } }),
}));
jest.mock('../../../lib/appData/AppDataContext', () => ({ useAppData: () => ({
  getAvatarUri: () => null, setOwnAvatar: mockSetAvatar, removeOwnAvatar: mockRemoveAvatar,
}) }));
jest.mock('../../../components/Toast', () => ({ useToast: () => mockToast }));
jest.mock('../../../components/ConfirmDialog', () => ({ useConfirm: () => mockConfirm }));

beforeEach(() => {
  mockMode = 'supabase';
  (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
  (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
  const image = { canceled: false, assets: [{ uri: 'photo.jpg', base64: 'image-content', mimeType: 'image/jpeg', fileSize: 100 }] };
  (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue(image);
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue(image);
  mockSetAvatar.mockResolvedValue(undefined);
});

it('requests no permissions until tapped, then uploads a camera image through the existing action', async () => {
  const { result } = renderHook(useProfileAvatar);
  expect(ImagePicker.requestCameraPermissionsAsync).not.toHaveBeenCalled();
  await act(async () => { await result.current.takePhoto(); });
  expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  expect(mockSetAvatar).toHaveBeenCalledWith({ base64: 'image-content', mimeType: 'image/jpeg', fileSize: 100 });
  expect(result.current.busy).toBeNull();
});

it('uses only the library permission and picker for uploads', async () => {
  const { result } = renderHook(useProfileAvatar);
  await act(async () => { await result.current.changePhoto(); });
  expect(ImagePicker.requestMediaLibraryPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
  expect(ImagePicker.requestCameraPermissionsAsync).not.toHaveBeenCalled();
});

it('handles denied camera access without launching the camera or uploading', async () => {
  (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });
  const { result } = renderHook(useProfileAvatar);
  await act(async () => { await result.current.takePhoto(); });
  expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  expect(mockSetAvatar).not.toHaveBeenCalled();
  expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('allow camera access'), 'error');
  expect(result.current.busy).toBeNull();
});

it('cancelling the camera preserves the current avatar', async () => {
  (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });
  const { result } = renderHook(useProfileAvatar);
  await act(async () => { await result.current.takePhoto(); });
  expect(mockSetAvatar).not.toHaveBeenCalled();
  expect(mockToast).not.toHaveBeenCalled();
});

it('blocks competing picker and removal actions while permission is pending', async () => {
  let grant!: (value: { granted: boolean }) => void;
  (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockReturnValue(new Promise((resolve) => { grant = resolve; }));
  const { result } = renderHook(useProfileAvatar);
  let pending!: Promise<void>;
  act(() => { pending = result.current.takePhoto(); });
  expect(result.current.busy).toBe('picking');
  await act(async () => {
    await result.current.changePhoto();
    await result.current.removePhoto();
    grant({ granted: true });
    await pending;
  });
  expect(ImagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
  expect(mockConfirm).not.toHaveBeenCalled();
  expect(mockSetAvatar).toHaveBeenCalledTimes(1);
});

it('reports camera errors and allows a later retry', async () => {
  (ImagePicker.launchCameraAsync as jest.Mock).mockRejectedValueOnce(new Error('Camera unavailable.'));
  const { result } = renderHook(useProfileAvatar);
  await act(async () => { await result.current.takePhoto(); });
  expect(mockToast).toHaveBeenCalledWith('Camera unavailable.', 'error');
  expect(result.current.busy).toBeNull();
  await act(async () => { await result.current.takePhoto(); });
  expect(mockSetAvatar).toHaveBeenCalledTimes(1);
});

it('never opens a picker or writes avatars in demo mode', async () => {
  mockMode = 'demo';
  const { result } = renderHook(useProfileAvatar);
  await act(async () => {
    await result.current.takePhoto(); await result.current.changePhoto(); await result.current.removePhoto();
  });
  expect(ImagePicker.requestCameraPermissionsAsync).not.toHaveBeenCalled();
  expect(ImagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
  expect(mockSetAvatar).not.toHaveBeenCalled();
  expect(mockRemoveAvatar).not.toHaveBeenCalled();
});
