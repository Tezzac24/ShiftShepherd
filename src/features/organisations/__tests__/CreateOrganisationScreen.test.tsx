import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { useAuth } from '../../../lib/auth/AuthContext';
import CreateOrganisationScreen from '../CreateOrganisationScreen';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ replace: mockReplace }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../../lib/auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const mockUseAuth = useAuth as jest.Mock;

it('submits once, waits for the transaction, and enters the app', async () => {
  let finish!: () => void;
  const createOrganisation = jest.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
  mockUseAuth.mockReturnValue({ createOrganisation });
  const screen = render(<CreateOrganisationScreen />);
  fireEvent.changeText(screen.getByLabelText('Organisation name'), 'Grace Church');
  fireEvent.press(screen.getByText('Create organisation'));
  fireEvent.press(screen.getByText('Create organisation'));
  expect(createOrganisation).toHaveBeenCalledTimes(1);
  finish();
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)/home'));
});
