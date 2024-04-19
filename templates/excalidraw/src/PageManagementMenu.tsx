import { File, FilePlus, Folder, PencilSimple } from '@phosphor-icons/react';
import { useEntity } from '@triplit/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PageRenameDialog } from './components/PageRenameDialog';
import { client, useUnsyncedElementsCount, createNewPage } from './triplit';
import { usePageId } from './use-query-params';

export function PageManagementMenu({ pages: pages }: { pages: any[] }) {
  const [currentPageId, setCurrentPageId] = usePageId();
  const [pageListIsOpen, setPageListIsOpen] = useState(false);
  const [showRenamingDialog, setShowRenamingDialog] = useState<{
    pageId: string;
    prevName: string;
  } | null>(null);
  const { results: currentPage } = useEntity(
    client,
    'pages',
    currentPageId ?? ''
  );
  const pageMenu = useRef<HTMLDivElement>(null);

  const unsyncedChangesCount = useUnsyncedElementsCount();

  const onMouseDown = useCallback(
    (e: MouseEvent) => {
      if (!pageMenu.current?.contains(e.target)) setPageListIsOpen(false);
    },
    [pageMenu]
  );

  useEffect(() => {
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [onMouseDown]);

  return (
    <>
      <PageRenameDialog
        pageId={showRenamingDialog?.pageId}
        initialName={showRenamingDialog?.prevName ?? ''}
        onClose={() => {
          setShowRenamingDialog(null);
        }}
      />
      <div
        className={`bg-inherit text-zinc-300 overflow-hidden shrink text-sm cursor-pointer px-3 transition h-9 gap-2 flex flex-row justify-center border-[1px] items-center border-zinc-700 hover:bg-zinc-800 rounded-lg ${
          currentPage ? 'justify-between' : ''
        }`}
        onClick={() => {
          setPageListIsOpen(!pageListIsOpen);
        }}
      >
        {currentPage ? (
          <>
            <span className="truncate w-[175px]">
              {currentPage.name as string}
            </span>
            <div
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowRenamingDialog({
                  pageId: currentPage.id,
                  prevName: currentPage.name,
                });
              }}
            >
              <PencilSimple className="shrink-0" size={16} />
            </div>
          </>
        ) : (
          <>
            <Folder className="shrink-0" size={20} weight={'regular'} />
            <span className="hidden truncate w-[175px] min-[730px]:inline-block">
              No page selected
            </span>
          </>
        )}
      </div>
      {pageListIsOpen && (
        <div
          ref={pageMenu}
          className="w-[225px] z-40 shadow-island text-sm text-zinc-300 bg-zinc-900 absolute left-2 top-14 p-2 rounded-lg"
        >
          <div>
            <div
              className="cursor-pointer w-full text-rose-400 flex h-[32px] px-[10px] mb-3 flex-row gap-2 items-center rounded-lg hover:bg-rose-500/10 border border-rose-400/20"
              onClick={() => {
                createNewPage().then((result) => {
                  setCurrentPageId(result.output.id);
                  setPageListIsOpen(false);
                });
              }}
            >
              <FilePlus size={16} className="shrink-0" />
              <span className="truncate">Create a new page</span>
            </div>

            {/* {pagesArray.length > 0 && (
                    <hr className="my-2 mx-2 border-t-zinc-500" />
                  )} */}

            {pages.map((page) => (
              <div
                key={page.id}
                onClick={() => {
                  setCurrentPageId(page.id);
                  setPageListIsOpen(false);
                }}
                className={`${
                  page.id === currentPageId
                    ? 'bg-zinc-700'
                    : 'hover:bg-zinc-800'
                } cursor-pointer w-full fle h-[32px] px-[10px] flex flex-row gap-2 items-center rounded-l`}
              >
                <File
                  weight={page.id === currentPageId ? 'bold' : 'regular'}
                  size={16}
                  className="shrink-0"
                />
                <span className="truncate">
                  {page.name}
                  {unsyncedChangesCount[page.id] > 0 && (
                    <span className="text-base">*</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
