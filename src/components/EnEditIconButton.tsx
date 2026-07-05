"use client";

type Props = {
  title: string;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
};

export function EnEditIconButton({
  title,
  disabled,
  onClick,
  className = "",
}: Props) {
  return (
    <button
      type="button"
      className={`jp-edit-icon-btn${className ? ` ${className}` : ""}`}
      disabled={disabled}
      title={title}
      aria-label={title}
      onClick={onClick}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path
          d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>

      <style jsx>{`
        .jp-edit-icon-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          width: 1.65rem;
          height: 1.65rem;
          padding: 0;
          border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
          border-radius: 6px;
          background: color-mix(in srgb, var(--accent) 8%, var(--panel));
          color: var(--accent);
          cursor: pointer;
          vertical-align: middle;
        }

        .jp-edit-icon-btn:hover:not(:disabled) {
          background: color-mix(in srgb, var(--accent) 16%, var(--panel));
        }

        .jp-edit-icon-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
      `}</style>
    </button>
  );
}
