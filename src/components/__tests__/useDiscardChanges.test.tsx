import { act, renderHook } from '@testing-library/react-native';

import { useDiscardChanges } from '../useDiscardChanges';

const mockConfirm = jest.fn();
jest.mock('../ConfirmDialog', () => ({ useConfirm: () => mockConfirm }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

beforeEach(() => { mockConfirm.mockReset().mockResolvedValue(false); });

it('waits for a cold draft and retains its baseline through later refreshes', async () => {
  const leave = jest.fn();
  const { result, rerender } = renderHook(({ value }: { value: unknown }) => useDiscardChanges({ value, onDiscard: leave }),
    { initialProps: { value: null } });
  rerender({ value: { title: 'Stored title', rows: [{ localId: 'row-1', person: 'Sarah' }] } });
  act(() => result.current.requestExit());
  expect(leave).toHaveBeenCalledTimes(1);
  expect(mockConfirm).not.toHaveBeenCalled();
  leave.mockClear();
  rerender({ value: { title: 'My draft', rows: [{ localId: 'row-1', person: 'Sarah' }] } });
  await act(async () => result.current.requestExit());
  expect(mockConfirm).toHaveBeenCalledTimes(1);
  expect(leave).not.toHaveBeenCalled();
  rerender({ value: { title: 'Stored title', rows: [{ localId: 'new-row-id', person: 'Sarah' }] } });
  act(() => result.current.requestExit());
  expect(leave).toHaveBeenCalledTimes(1);
  expect(mockConfirm).toHaveBeenCalledTimes(1);
});

it('waits for a single decision and exits only after explicit discard', async () => {
  let finish!: (discard: boolean) => void;
  mockConfirm.mockReturnValue(new Promise<boolean>((resolve) => { finish = resolve; }));
  const leave = jest.fn();
  const { result } = renderHook(() => useDiscardChanges({ hasChanges: true, onDiscard: leave }));
  act(() => { result.current.requestExit(); result.current.requestExit(); });
  expect(mockConfirm).toHaveBeenCalledTimes(1);
  expect(leave).not.toHaveBeenCalled();
  expect(mockConfirm).toHaveBeenCalledWith(expect.objectContaining({
    title: 'Discard changes?', message: 'Your changes will not be saved.',
    confirmLabel: 'Discard changes', cancelLabel: 'Keep editing',
  }));
  await act(async () => finish(true));
  expect(leave).toHaveBeenCalledTimes(1);
});

it('blocks exits during a write and skips discard confirmation after confirmed success', () => {
  const leave = jest.fn();
  const { result, rerender } = renderHook(({ blocked, saved }: { blocked: boolean; saved: boolean }) => useDiscardChanges({ hasChanges: true, blocked, saved, onDiscard: leave }),
    { initialProps: { blocked: true, saved: false } });
  act(() => result.current.requestExit());
  expect(leave).not.toHaveBeenCalled();
  expect(mockConfirm).not.toHaveBeenCalled();
  rerender({ blocked: false, saved: true });
  act(() => result.current.requestExit());
  expect(leave).toHaveBeenCalledTimes(1);
  expect(mockConfirm).not.toHaveBeenCalled();
});

it('does not promise that nothing was saved after an uncertain write', async () => {
  const leave = jest.fn();
  const { result } = renderHook(() => useDiscardChanges({ hasChanges: false, uncertain: true, onDiscard: leave }));
  await act(async () => result.current.requestExit());
  expect(mockConfirm).toHaveBeenCalledWith(expect.objectContaining({
    message: 'Some changes may already have been saved. Leaving will discard the draft kept on this screen.',
  }));
  expect(leave).not.toHaveBeenCalled();
});

it('ignores a confirmation completed after its owning editor unmounts', async () => {
  let finish!: (discard: boolean) => void;
  mockConfirm.mockReturnValue(new Promise<boolean>((resolve) => { finish = resolve; }));
  const leave = jest.fn();
  const { result, unmount } = renderHook(() => useDiscardChanges({ hasChanges: true, onDiscard: leave }));
  act(() => result.current.requestExit());
  unmount();
  await act(async () => finish(true));
  expect(leave).not.toHaveBeenCalled();
});
