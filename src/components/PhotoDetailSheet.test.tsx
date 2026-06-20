// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { CityDTO } from '@/types/city';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPhotos = [
  { id: 'p1', masterUrl: 'https://example.com/master1.jpg', thumbUrl: 'https://example.com/thumb1.jpg', orderIndex: 0 },
  { id: 'p2', masterUrl: 'https://example.com/master2.jpg', thumbUrl: 'https://example.com/thumb2.jpg', orderIndex: 1 },
];

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

// ---------------------------------------------------------------------------
// Component under test — import AFTER mocks
// ---------------------------------------------------------------------------

// This import will fail with "Cannot find module" until Task 3 ships PhotoDetailSheet
import { PhotoDetailSheet } from './PhotoDetailSheet.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockUsePhotosQuery.mockReturnValue({ data: undefined, error: null, refetch: vi.fn() });
  // jsdom does not implement HTMLDialogElement.showModal; polyfill it so the
  // native <dialog>-based PhotoDetailSheet renders with [open] set.
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

describe('PhotoDetailSheet', () => {
  it('renders role="dialog" aria-modal="true"', () => {
    render(<PhotoDetailSheet city={mockCity} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('renders city.name in a heading', () => {
    render(<PhotoDetailSheet city={mockCity} onClose={vi.fn()} />);
    expect(screen.getByText('Tokyo')).toBeTruthy();
  });

  it('renders the read-only caption when provided', () => {
    render(<PhotoDetailSheet city={mockCity} onClose={vi.fn()} />);
    expect(screen.getByText('A lovely trip to Japan.')).toBeTruthy();
  });

  it('pressing Escape calls onClose', () => {
    const onClose = vi.fn();
    render(<PhotoDetailSheet city={mockCity} onClose={onClose} />);
    // A11Y-06 (Phase 11): listener now lives on document in capture phase
    // (close-watcher anti-modal-trap pattern). Dispatch on document so the
    // capture-phase handler fires.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('when usePhotosQuery returns data, renders one img per photo with alt=""', () => {
    mockUsePhotosQuery.mockReturnValue({ data: mockPhotos, error: null, refetch: vi.fn() });
    const { container } = render(<PhotoDetailSheet city={mockCity} onClose={vi.fn()} />);
    const imgs = container.querySelectorAll('img[alt=""]');
    // At least one img for each photo (thumbs in grid; could also be in viewer placeholder)
    expect(imgs.length).toBeGreaterThanOrEqual(mockPhotos.length);
  });

  it('focus returns to the previously-focused element when the sheet closes', () => {
    // Create a button, focus it, then mount the sheet
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount } = render(<PhotoDetailSheet city={mockCity} onClose={vi.fn()} />);
    unmount();

    expect(document.activeElement).toBe(trigger);
    document.body.removeChild(trigger);
  });
});
