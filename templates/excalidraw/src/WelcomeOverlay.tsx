import { File, FilePlus } from '@phosphor-icons/react';
import TAILWIND_COLORS from 'tailwindcss/colors';
import { createNewPage } from './triplit';
import { usePageId } from './use-query-params';

export function WelcomeOverlay({ pages }: { pages: any[] }) {
  const [currentPageId, setCurrentPageId] = usePageId();
  if (currentPageId) return null;
  return (
    <div className="flex justify-center items-center absolute inset-0 z-20 bg-[rgba(0,0,0,0.5)]">
      <div className="bg-white text-black p-5 rounded-lg">
        <span className="">
          {'Welcome to Excalidraw powered by '}
          <a
            className="hover:underline"
            style={{
              color: TAILWIND_COLORS.rose[500],
              fontWeight: 700,
              fontFamily:
                'ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,Noto Sans,sans-serif,Apple Color Emoji,Segoe UI Emoji,Segoe UI Symbol,Noto Color Emoji',
            }}
            href="https://www.triplit.dev/"
          >
            Triplit
          </a>
        </span>
        <div className="w-full mt-4 font-bold">Pages</div>

        <div className="flex flex-col mt-2  gap-1">
          <div
            onClick={() =>
              createNewPage().then((page) => setCurrentPageId(page.output.id))
            }
            className="cursor-pointer flex text-rose-500 flex-row items-center w-full px-3 py-2 gap-3 rounded-lg  hover:bg-zinc-100"
          >
            <FilePlus size={16} />
            Create new page
          </div>
          {pages.map((page) => (
            <div
              key={page.id}
              className="flex flex-row text-zinc-500 items-center cursor-pointer px-3 py-2 rounded-lg gap-3 hover:bg-zinc-100"
              onClick={() => setCurrentPageId(page.id)}
            >
              <File size={16} />
              {page.name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
