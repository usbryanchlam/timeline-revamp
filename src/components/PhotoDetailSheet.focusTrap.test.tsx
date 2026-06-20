// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import type { CityDTO } from '@/types/city';

// ---------------------------------------------------------------------------
// Mocks (mirrors PhotoDetailSheet.test.tsx)
// ---------------------------------------------------------------------------

const mockUsePhotosQuery = vi.fn().mockReturnValue({
  data: undefined,
  error: null,
  refetch: vi.fn(),
});

vi.mock('@/hooks/usePhotosQuery', () => ({
  usePhotosQuery: (...args: unknown[]) => mockUsePhotosQuery(...args),
}));

vi.mock('@/auth/useApi', () => ({
  useApi: () => vi.fn(),
}));

vi.mock('@/photos/heicToJpeg', () => ({
  detectIsHeic: vi.fn().mockResolvedValue(false),
  convertHeicToJpeg: vi.fn().mockResolvedValue(new Blob()),
}));

vi.mock('@/photos/canvasResize', () => ({
  resizeAndStrip: vi.fn().mockResolvedValue(new Blob()),
}));

vi.mock('@/photos/uploadQueue', () => ({
  createUploadQueue: vi.fn().mockReturnValue({
    add: vi.fn().mockReturnValue([]),
    retry: vi.fn(),
    cancelAll: vi.fn(),
  }),
  xhrUpload: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/api/photos', () => ({
  requestUploadUrl: vi.fn().mockResolvedValue({ photoId: 'p1', uploadUrl: 'https://oci.example.com/upload' }),
  finalizePhoto: vi.fn().mockResolvedValue({ id: 'p1', masterUrl: 'https://example.com/master.jpg', thumbUrl: 'https://example.com/thumb.jpg' }),
  deletePhoto: vi.fn().mockResolvedValue(undefined),
}));

import { PhotoDetailSheet } from './PhotoDetailSheet';

const mockCity: CityDTO = {
  id: 'city-1',
  userId: 'user-1',
  orderIndex: 0,
  name: 'Tokyo',
  tripLabel: null,
  lat: 35.6762,
  lng: 139.6503,
  zoom: 12,
  pitch: 0,
  bearing: 0,
  arrivedAt: '2024-10-01T00:00:00.000Z',
  caption: 'A lovely trip to Japan.',
  createdAt: '2024-10-01T00:00:00.000Z',
  updatedAt: '2024-10-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUsePhotosQuery.mockReturnValue({ data: undefined, error: null, refetch: vi.fn() });
  // jsdom does not implement HTMLDialogElement.showModal; polyfill it.
  if (!('showModal' in HTMLDialogElement.prototype)) {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      writable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      writable: true,
      value: function (this: HTMLDialogElement) {
        this.removeAttribute('open');
      },
    });
  }
});

describe('PhotoDetailSheet — A11Y-06 native <dialog> + close-watcher anti-modal-trap', () => {
  it('renders a native <dialog> in open state (showModal called)', () => {
    const { container } = render(<PhotoDetailSheet city={mockCity} onClose={vi.fn()} />);
    const dialog = container.querySelector('dialog');
    expect(dialog).not.toBeNull();
    expect((dialog as HTMLDialogElement).open).toBe(true);
  });

  it('Esc closes the dialog via document-level keydown capture (onClose called)', () => {
    const onClose = vi.fn();
    render(<PhotoDetailSheet city={mockCity} onClose={onClose} />);
    // Dispatch Esc at the document level (mirrors a real keyboard event).
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('preventDefault is applied to the dialog cancel event (anti-modal-trap)', () => {
    const { container } = render(<PhotoDetailSheet city={mockCity} onClose={vi.fn()} />);
    const dialog = container.querySelector('dialog')!;
    const ev = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });
});
