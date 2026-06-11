"use client";

type Props = {
  onClose: () => void;
};

const SHORTCUTS = [
  { key: "/", description: "Focus search / filter bar" },
  { key: "n", description: "Focus first column add-card input" },
  { key: "a", description: "Toggle activity drawer" },
  { key: "s", description: "Toggle statistics drawer" },
  { key: "l", description: "Toggle label palette" },
  { key: "?", description: "Show this help overlay" },
  { key: "Esc", description: "Close open drawer or modal" },
];

export const KeyboardShortcutsOverlay = ({ onClose }: Props) => (
  <>
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
      aria-hidden="true"
      onClick={onClose}
    />
    <div
      role="dialog"
      aria-label="Keyboard shortcuts"
      aria-modal="true"
      className="fixed left-1/2 top-1/2 z-50 w-80 -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--stroke)] bg-white p-6 shadow-2xl"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-display text-base font-semibold text-[var(--navy-dark)]">
          Keyboard shortcuts
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close keyboard shortcuts"
          className="rounded-lg p-1.5 text-[var(--gray-text)] transition hover:bg-[var(--surface)]"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
      <ul className="mt-4 flex flex-col gap-2">
        {SHORTCUTS.map(({ key, description }) => (
          <li key={key} className="flex items-center justify-between gap-4">
            <span className="text-sm text-[var(--gray-text)]">{description}</span>
            <kbd className="inline-flex h-7 min-w-[28px] items-center justify-center rounded-md border border-[var(--stroke)] bg-[var(--surface)] px-2 font-mono text-xs font-semibold text-[var(--navy-dark)]">
              {key}
            </kbd>
          </li>
        ))}
      </ul>
    </div>
  </>
);
