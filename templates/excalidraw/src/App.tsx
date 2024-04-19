import {
  Excalidraw,
  Footer,
  MainMenu,
  getSceneVersion,
} from '@excalidraw/excalidraw';
import { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types/types';
import { Value } from '@sinclair/typebox/value';
import { generateKeyBetween } from 'fractional-indexing';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TAILWIND_COLORS from 'tailwindcss/colors';
import './App.css';
import { client, useExcalidrawElements, usePages } from './triplit';
import { usePageId } from './use-query-params';
import { debounce } from './utils/debounce';
import { WelcomeOverlay } from './WelcomeOverlay';
import { PageManagementMenu } from './PageManagementMenu';
import { SyncStateIndicator } from './SyncStateIndicator';

function useCallbackRefState<T>() {
  const [refValue, setRefValue] = useState<T | null>(null);
  const refCallback = useCallback((value: T | null) => setRefValue(value), []);
  return [refValue, refCallback] as const;
}

function App() {
  // TODO: make sure useSyncQueryParams is working as intended because i'm getting some weird behavior
  // as we're not currently persisting local stage on refreshes but we are persisting the url param
  // TODO: we want this to reset if you update your connection
  const prevState = useRef({});
  const [excalidrawAPI, excalidrawRefCallback] =
    useCallbackRefState<ExcalidrawImperativeAPI>();

  const { results } = useExcalidrawElements();
  const { results: pages } = usePages();
  const [currentPageId] = usePageId();

  useEffect(() => {
    if (!excalidrawAPI) return;
    prevState.current = {};
    excalidrawAPI.resetScene();
  }, [currentPageId, excalidrawAPI]);

  useEffect(() => {
    if (!excalidrawAPI) return;
    if (!results) {
      excalidrawAPI.resetScene();
      return;
    }
    const elements = Array.from(results.values()).map((elem) => {
      if (elem.groupIds) {
        elem.groupIds = Object.values(elem.groupIds);
      } else {
        elem.groupIds = [];
      }
      if (elem.points) {
        elem.points = Object.values(elem.points).map((point) =>
          Object.values(point)
        );
      }
      return elem;
    });

    const dbSceneVersion = getSceneVersion(elements);
    const excalidrawElements = excalidrawAPI.getSceneElementsIncludingDeleted();
    const excalidrawSceneVersion = getSceneVersion(excalidrawElements);
    // console.log(Value.Diff(excalidrawElements, elements));
    if (dbSceneVersion < excalidrawSceneVersion) return;
    const scene = {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      elements: elements.map(({ _fracIndex, ...elem }) => elem),
    };
    // Set prev state here so we wont trigger sync on DB updates
    const normalizedState = normalizeElements(elements);
    prevState.current = normalizedState;
    if (excalidrawAPI.ready) {
      excalidrawAPI.updateScene(scene);
    } else {
      excalidrawAPI.readyPromise.then(() => {
        excalidrawAPI.updateScene(scene);
      });
    }
    // TODO: should we include excalidrawAPI as dep?
  }, [results]);
  const onChange = useCallback(
    debounce(async (elements) => {
      let latestElements = elements;
      const pageId = currentPageId;
      latestElements = latestElements.map((elem, i) => {
        const prevElemState = prevState.current[elem.id];
        if (!prevElemState) {
          console.log('new elem', elem);
          return { ...elem };
        }
        if (!prevElemState._fracIndex) throw new Error('missing _fracIndex');
        return { ...elem, _fracIndex: prevElemState._fracIndex };
      });
      assignFractionalIndices(latestElements);
      const normalizedState = normalizeElements(latestElements);
      const changes = Value.Diff(prevState.current, normalizedState);
      if (!changes) return;
      try {
        await client.transact(async (tx) => {
          for (const change of changes) {
            if (change.type === 'insert') {
              const elementDoc = Value.Patch({}, [change]);
              const [id, element] = Object.entries(elementDoc)[0];
              await tx.insert('elements', { ...element, pageId }, id);
            } else if (change.type === 'update') {
              const [entityId, ...pathArr] = change.path.split('/').slice(1);
              const lastPath = pathArr.pop();
              await tx.update('elements', entityId, async (entity) => {
                let scope = entity;
                for (const path of pathArr) {
                  scope = scope[path];
                }
                scope[lastPath] = change.value;
              });
            }
          }
        });
        prevState.current = normalizedState;
      } catch (e) {
        // Rollback elements to previous state
        // Might be even better to query the db for the latest and reset the scene that way
        const rollbackElements = Object.values(prevState.current ?? {});
        const scene = {
          elements: rollbackElements,
        };
        if (excalidrawAPI?.ready) {
          excalidrawAPI?.updateScene(scene);
        } else {
          excalidrawAPI?.readyPromise.then(() => {
            excalidrawAPI?.updateScene(scene);
          });
        }
      }
    }, 200),
    [currentPageId, excalidrawAPI]
  );

  function assignFractionalIndices(
    elements: { _fracIndex?: string }[],
    prevIndex?: string
  ): string | undefined {
    if (elements.length === 0) return undefined;
    const [currElem, ...rest] = elements;
    if (currElem._fracIndex) {
      const greaterThanPrev = !prevIndex || prevIndex < currElem._fracIndex;
      const isLessThanNext =
        rest.length === 0 ||
        (rest[0]._fracIndex && currElem._fracIndex < rest[0]._fracIndex);
      if (greaterThanPrev && isLessThanNext) {
        assignFractionalIndices(rest, currElem._fracIndex);
        return currElem._fracIndex;
      }
    }
    currElem._fracIndex = generateKeyBetween(
      prevIndex,
      // make sure to include prev index as min so we dont gen out of order keys
      assignFractionalIndices(rest, prevIndex)
    );
    return currElem._fracIndex;
  }

  const pagesArray = useMemo(() => (pages ? [...pages.values()] : []), [pages]);

  return (
    <div className="flex flex-col w-[100vw] h-[100vh]">
      <div className="w-[100vw] bg-zinc-900 flex flex-row justify-between items-center py-2 px-2 gap-3">
        <PageManagementMenu pages={pagesArray} />
        <SyncStateIndicator />
      </div>
      <div className="relative grow">
        <WelcomeOverlay pages={pagesArray} />
        <Excalidraw
          onChange={onChange}
          ref={excalidrawRefCallback}
          isCollaborating
          renderTopRightUI={() => (
            <>
              <div className="absolute top-14 min-[730px]:w-[calc((100vw-650px)/2)] w-auto min-[730px]:top-0 left-0 min-[730px]:left-12 flex flex-col min-[730px]:flex-row gap-2 items-start"></div>
              <div className="absolute min-[730px]:w-[calc((100vw-670px)/2)] min-[1025px]:w-[calc((100vw-730px)/2)] top-36 left-0 min-[730px]:top-0 min-[730px]:left-[calc(520px+(100vw-500px)/2)] flex items-end"></div>
            </>
          )}
          // initialData={{ elements: [] }}
          // initialData={{ elements: intialElems, scrollToContent: true }}
        >
          <MainMenu>
            <MainMenu.DefaultItems.Help />
            <MainMenu.Separator />
            <MainMenu.DefaultItems.ToggleTheme />
            <MainMenu.DefaultItems.ChangeCanvasBackground />
          </MainMenu>
          <Footer>
            <div className="text-xl mt-1 ml-3 absolute left-[50%] right-[50%] -translate-x-[50%] text-center w-[160px]">
              <span className="">
                {'Powered by '}
                <a
                  style={{
                    color: TAILWIND_COLORS.rose[500],
                    fontWeight: 700,
                    fontFamily:
                      'ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,Noto Sans,sans-serif,Apple Color Emoji,Segoe UI Emoji,Segoe UI Symbol,Noto Color Emoji',
                  }}
                  href="https://www.triplit.dev/"
                >
                  {'Triplit'}
                </a>
              </span>
            </div>
          </Footer>
        </Excalidraw>
      </div>
    </div>
  );
}

function normalizeElements(elements: any[]) {
  return structuredClone(elements).reduce((obj, item) => {
    obj[item.id] = item;
    return obj;
  }, {});
}

export default App;
