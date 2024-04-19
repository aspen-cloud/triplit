import * as React from 'react';

export function Modal({
  children,
  open,
  onRequestClose,
  onSubmit,
  submitText = 'Submit',
  submitDisabled = false,
  className = '',
}: {
  children: any;
  open: boolean;
  onRequestClose: () => void;
  onSubmit: () => void;
  submitText?: string;
  submitDisabled?: boolean;
  className?: string;
}) {
  const dialogRef = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    const dialogNode = dialogRef.current;
    if (open && !dialogNode?.open) {
      dialogNode.showModal();
    } else {
      dialogNode.close();
    }
  }, [open]);

  React.useEffect(() => {
    const dialogNode = dialogRef.current;
    const handleCancel = (event: Event) => {
      event.preventDefault();

      onRequestClose();
    };
    dialogNode.addEventListener('cancel', handleCancel);

    return () => {
      dialogNode.removeEventListener('cancel', handleCancel);
    };
  }, [onRequestClose]);

  return (
    <dialog
      ref={dialogRef}
      className={
        'open:p-0 open:bg-transparent backdrop:bg-black backdrop:opacity-60'
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
          onRequestClose();
        }}
      >
        <div
          className={
            'flex flex-col bg-zinc-900 text-zinc-500 rounded-lg overflow-hidden shadow-md' +
            className
          }
        >
          <div className="flex flex-col px-5 pt-5">{children}</div>
          <div className="flex w-full flex-row justify-end p-5 gap-3">
            <button
              className="transition rounded-lg border-zinc-500 hover:bg-zinc-800 hover:border-zinc-500"
              type="button"
              onClick={onRequestClose}
            >
              Cancel
            </button>
            <button
              className={
                'transition border-emerald-400 bg-emerald-500 hover:bg-emerald-400 hover:border-emerald-400  text-emerald-100 rounded-lg disabled:bg-zinc-800 disabled:border-zinc-600 disabled:text-zinc-600 disabled:cursor-not-allowed'
              }
              disabled={submitDisabled}
              type="submit"
            >
              {submitText ?? 'Submit'}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
