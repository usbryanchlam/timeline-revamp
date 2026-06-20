// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// matchMedia mock for prefers-reduced-motion tests
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Component under test — import AFTER mocks
// ---------------------------------------------------------------------------

// This import will fail with "Cannot find module" until Task 4 ships PhotoViewer
import { PhotoViewer } from './PhotoViewer.js';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const mockPhotos = [
  { id: 'p1', masterUrl: 'https://example.com/master1.jpg', thumbUrl: 'https://example.com/thumb1.jpg', orderIndex: 0 },
  { id: 'p2', masterUrl: 'https://example.com/master2.jpg', thumbUrl: 'https://example.com/thumb2.jpg', orderIndex: 1 },
  { id: 'p3', masterUrl: 'https://example.com/master3.jpg', thumbUrl: 'https://example.com/thumb3.jpg', orderIndex: 2 },
];

const defaultProps = {
  photos: mockPhotos,
  initialIndex: 0,
  cityId: 'city-1',
  onClose: vi.fn(),
  onPhotoDeleted: vi.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockMatchMedia(false);
  // jsdom lacks HTMLDialogElement.showModal — polyfill for the native
  // <dialog>-based PhotoViewer (A11Y-06 conversion).
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

describe('PhotoViewer', () => {
  it('renders role="dialog" aria-modal="true"', () => {
    render(<PhotoViewer {...defaultProps} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('renders the photo at initialIndex (img src === photos[initialIndex].masterUrl)', () => {
    render(<PhotoViewer {...defaultProps} initialIndex={1} />);
    const masterImg = screen.getByTestId('photo-viewer-master');
    expect(masterImg.getAttribute('src')).toBe(mockPhotos[1].masterUrl);
  });

  it('ArrowRight advances the index; ArrowLeft goes back; clamps at ends', () => {
    render(<PhotoViewer {...defaultProps} initialIndex={0} />);
    const masterImg = screen.getByTestId('photo-viewer-master');

    // Arrow handler moved to document-level (Phase 11 native <dialog>).
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(masterImg.getAttribute('src')).toBe(mockPhotos[1].masterUrl);

    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(masterImg.getAttribute('src')).toBe(mockPhotos[0].masterUrl);

    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(masterImg.getAttribute('src')).toBe(mockPhotos[0].masterUrl);
  });

  it('pressing Escape calls onClose', () => {
    const onClose = vi.fn();
    render(<PhotoViewer {...defaultProps} onClose={onClose} />);
    // A11Y-06: listener now on document in capture phase (close-watcher fix).
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('backdrop tap calls onClose; clicking the image does NOT close', async () => {
    const onClose = vi.fn();
    const { container } = render(<PhotoViewer {...defaultProps} onClose={onClose} />);
    // Backdrop is the root dialog element
    const dialog = screen.getByRole('dialog');
    await userEvent.click(dialog);
    // onClose is called when backdrop is clicked
    expect(onClose).toHaveBeenCalled();

    onClose.mockClear();

    // Image container has stopPropagation, so clicking it should NOT call onClose
    const masterImg = screen.getByTestId('photo-viewer-master');
    await userEvent.click(masterImg);
    expect(onClose).not.toHaveBeenCalled();
    void container;
  });

  it('prefers-reduced-motion: no transition- Tailwind classes on master image element', () => {
    mockMatchMedia(true);
    render(<PhotoViewer {...defaultProps} />);
    const masterImg = screen.getByTestId('photo-viewer-master');
    expect(masterImg.className).not.toContain('transition-');
  });

  it('focus returns to document.activeElement at open after viewer closes', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount } = render(<PhotoViewer {...defaultProps} />);
    unmount();

    expect(document.activeElement).toBe(trigger);
    document.body.removeChild(trigger);
  });

  it('trash icon click renders inline confirm with Cancel + Delete; Cancel restores trash icon', async () => {
    render(<PhotoViewer {...defaultProps} />);

    // Find and click the delete (trash) button
    const trashBtn = screen.getByRole('button', { name: /delete this photo/i });
    await userEvent.click(trashBtn);

    // Inline confirm should appear with Cancel and Delete buttons
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeTruthy();

    // Cancel should restore the trash icon
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(screen.getByRole('button', { name: /delete this photo/i })).toBeTruthy();
  });

  it('Confirm Delete calls deletePhoto, propagates onPhotoDeleted, advances to next', async () => {
    const onPhotoDeleted = vi.fn();
    const onClose = vi.fn();
    render(
      <PhotoViewer
        {...defaultProps}
        initialIndex={0}
        onPhotoDeleted={onPhotoDeleted}
        onClose={onClose}
        photos={mockPhotos}
      />,
    );

    // Click trash
    await userEvent.click(screen.getByRole('button', { name: /delete this photo/i }));

    // Click Confirm Delete
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }));

    expect(mockDeletePhoto).toHaveBeenCalledWith(expect.anything(), mockPhotos[0].id);
    expect(onPhotoDeleted).toHaveBeenCalledWith(mockPhotos[0].id);
    // Should NOT close since there are more photos
    expect(onClose).not.toHaveBeenCalled();
  });
});
