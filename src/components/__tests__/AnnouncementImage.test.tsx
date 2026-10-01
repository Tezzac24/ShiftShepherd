import { act, fireEvent, render } from '@testing-library/react-native';
import { ImageLoadEventData } from 'expo-image';
import React from 'react';

import { AnnouncementImage } from '../AnnouncementImage';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-image', () => ({ Image: 'ExpoImage' }));

const load = (width: number, height: number): ImageLoadEventData => ({
  cacheType: 'none', source: { url: 'local-image', width, height, mediaType: 'image/png' },
});

test('an absent URI renders neither an image nor an unavailable state', () => {
  const screen = render(<AnnouncementImage />);
  expect(screen.toJSON()).toBeNull();
});

test('thumbnail callers keep their requested crop and height without an animated transition', () => {
  const screen = render(<AnnouncementImage uri="local-image" height={120} />);
  const image = screen.getByLabelText('Announcement image');
  expect(image).toHaveProp('contentFit', 'cover');
  expect(image).toHaveStyle({ width: '100%', height: 120 });
  expect(image.props.transition).toBeUndefined();
  fireEvent(image, 'load', load(400, 800));
  expect(screen.getByLabelText('Announcement image')).toHaveStyle({ height: 120 });
});

test.each([[400, 800], [1200, 600]])('full images contain the whole %s×%s image at its loaded aspect ratio', (width, height) => {
  const screen = render(<AnnouncementImage uri="local-image" presentation="full" height={220} />);
  const image = screen.getByLabelText('Announcement image');
  expect(image).toHaveProp('contentFit', 'contain');
  expect(image).toHaveStyle({ width: '100%', height: 220 });
  fireEvent(image, 'load', load(width, height));
  expect(screen.getByLabelText('Announcement image')).toHaveStyle({ width: '100%', height: undefined, aspectRatio: width / height });
});

test.each([[0, 20], [20, 0], [-20, 20], [Infinity, 20], [20, NaN]])('invalid image dimensions %s×%s retain the safe preload height', (width, height) => {
  const screen = render(<AnnouncementImage uri="local-image" presentation="full" height={180} />);
  fireEvent(screen.getByLabelText('Announcement image'), 'load', load(width, height));
  expect(screen.getByLabelText('Announcement image')).toHaveStyle({ height: 180 });
});

test('an actual load failure is visible and a replacement URI starts with a fresh fallback', () => {
  const screen = render(<AnnouncementImage uri="first-image" presentation="full" height={180} />);
  fireEvent(screen.getByLabelText('Announcement image'), 'error', { error: 'Unavailable local image' });
  expect(screen.queryByLabelText('Announcement image')).toBeNull();
  expect(screen.getByText('Image unavailable')).toBeTruthy();
  screen.rerender(<AnnouncementImage uri="second-image" presentation="full" height={180} />);
  expect(screen.queryByText('Image unavailable')).toBeNull();
  expect(screen.getByLabelText('Announcement image')).toHaveStyle({ height: 180 });
});

test('replacing a loaded URI clears its dimensions and ignores late load/error callbacks from it', () => {
  const screen = render(<AnnouncementImage uri="first-image" presentation="full" height={180} />);
  const first = screen.getByLabelText('Announcement image');
  const oldLoad = first.props.onLoad;
  const oldError = first.props.onError;
  fireEvent(first, 'load', load(400, 800));
  screen.rerender(<AnnouncementImage uri="second-image" presentation="full" height={180} />);
  act(() => { oldLoad(load(2000, 200)); oldError({ error: 'Old image failed' }); });
  expect(screen.queryByText('Image unavailable')).toBeNull();
  expect(screen.getByLabelText('Announcement image')).toHaveStyle({ height: 180 });
  fireEvent(screen.getByLabelText('Announcement image'), 'load', load(600, 400));
  expect(screen.getByLabelText('Announcement image')).toHaveStyle({ height: undefined, aspectRatio: 1.5 });
  screen.rerender(<AnnouncementImage uri={null} presentation="full" />);
  act(() => { oldLoad(load(2000, 200)); oldError({ error: 'Old image failed' }); });
  expect(screen.toJSON()).toBeNull();
});
