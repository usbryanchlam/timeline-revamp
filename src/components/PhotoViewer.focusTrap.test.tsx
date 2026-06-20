// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

const mockDeletePhoto = vi.fn().mockResolvedValue(undefined);

vi.mock('@/api/photos', () => ({
  deletePhoto: (...args: unknown[]) => mockDeletePhoto(...args),
  listPhotos: vi.fn(),
  requestUploadUrl: vi.fn(),
  finalizePhoto: vi.fn(),
}));

vi.mock('@/auth/useApi', () => ({
  useApi: () => vi.fn(),
}));

function mockMatchMedia(prefersReduced: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: prefersReduced && q.includes('reduce'),
    media: q,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

import { PhotoViewer } from './PhotoViewer';

const mockPhotos = [
  { id: 'p1', masterUrl: 'https://example.com/master1.jpg', thumbUrl: 'https://example.com/thumb1.jpg', orderIndex: 0 },
  { id: 'p2', masterUrl: 'https://example.com/master2.jpg', thumbUrl: 'https://example.com/thumb2.jpg', orderIndex: 1 },
];

const defaultProps = {
  photos: mockPhotos,
  initialIndex: 0,
  cityId: 'city-1',
  onClose: vi.fn(),
  onPhotoDeleted: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockMatchMedia(false);
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

describe('PhotoViewer — A11Y-06 native <dialog> + close-watcher anti-modal-trap', () => {
  it('renders a native <dialog> in open state (showModal called)', () => {
    const { container } = render(<PhotoViewer {...defaultProps} />);
    const dialog = container.querySelector('dialog');
    expect(dialog).not.toBeNull();
    expect((dialog as HTMLDialogElement).open).toBe(true);
  });

  it('Esc closes the dialog via document-level keydown capture (onClose called)', () => {
    const onClose = vi.fn();
    render(<PhotoViewer {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('preventDefault is applied to the dialog cancel event (anti-modal-trap)', () => {
    const { container } = render(<PhotoViewer {...defaultProps} />);
    const dialog = container.querySelector('dialog')!;
    const ev = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });
});
