import { useState, useRef, useEffect } from 'react';
import { client } from '../triplit';
import { Modal } from './Modal';

export function PageRenameDialog({
  pageId,
  initialName,
  onClose,
}: {
  pageId?: string;
  initialName?: string;
  onClose: () => void;
}) {
  const [hasHighlighted, setHasHighlighted] = useState(false);
  const draftInputRef = useRef<HTMLInputElement>(null);
  const [draftPageName, setDraftPageName] = useState(initialName);
  useEffect(() => {
    if (initialName == undefined) return;
    setDraftPageName(initialName);
    setHasHighlighted(false);
    if (draftInputRef.current) {
      draftInputRef.current.select();
      setHasHighlighted(true);
    }
  }, [initialName]);

  return (
    <Modal
      open={!!pageId}
      onRequestClose={() => {
        onClose();
        setDraftPageName(undefined);
      }}
      submitDisabled={draftPageName === ''}
      submitText="Rename"
      onSubmit={async () => {
        if (!draftPageName || !pageId) return;
        client.update('pages', pageId, (entity) => {
          entity.name = draftPageName;
        });
      }}
    >
      <span className="w-full mb-5 text-zinc-500 flex flex-row items-center gap-2">
        Rename your page
      </span>
      <input
        className="appearance-none bg-zinc-700 rounded-lg border-[1px] text-zinc-300 border-zinc-500  outline-zinc-400 outline-[1px] p-2 w-full"
        value={draftPageName ?? initialName}
        style={{ outlineStyle: 'solid' }}
        type="text"
        placeholder="e.g. My Doodle Board"
        ref={(elem) => {
          draftInputRef.current = elem;
          if (!hasHighlighted) {
            elem?.select();
            setHasHighlighted(true);
          }
        }}
        onChange={(e) => setDraftPageName(e.target.value)}
      />
    </Modal>
  );
}
