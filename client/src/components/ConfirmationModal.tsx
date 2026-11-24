import { useEffect, useRef, useState } from "react";

/** Accessible confirmation dialog (focus moves in, Escape cancels, focus returns on close). */
export const ConfirmationModal = ({
  title,
  message,
  cancelLabel = "Cancel",
  confirmLabel = "Confirm",
  danger = false,
  handleOnConfirm,
  handleToggleShowConfirmationModal,
}: {
  title: string;
  message: string;
  cancelLabel?: string;
  confirmLabel?: string;
  danger?: boolean;
  handleOnConfirm: () => void | Promise<void>;
  handleToggleShowConfirmationModal: () => void;
}) => {
  const [areButtonsDisabled, setAreButtonsDisabled] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleToggleShowConfirmationModal();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
    // Mount-only: focus in on open, restore focus on close.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onConfirm = async () => {
    setAreButtonsDisabled(true);
    await handleOnConfirm();
    handleToggleShowConfirmationModal();
  };

  return (
    <div className="ff-modal-backdrop" onClick={handleToggleShowConfirmationModal}>
      <div
        className="ff-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ff-modal-title"
        aria-describedby="ff-modal-message"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="ff-modal-title" className="ff-modal__title">
          {title}
        </h2>
        <p id="ff-modal-message" className="ff-copy ff-copy--ink">
          {message}
        </p>
        <div className="ff-modal__actions">
          <button
            ref={cancelRef}
            type="button"
            className="btn ff-btn ff-btn--outline"
            onClick={handleToggleShowConfirmationModal}
            disabled={areButtonsDisabled}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ff-btn ${danger ? "ff-btn--danger" : ""}`}
            onClick={onConfirm}
            disabled={areButtonsDisabled}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
