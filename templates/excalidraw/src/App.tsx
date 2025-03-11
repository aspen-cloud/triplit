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
  const [elemsBeingEdited, setElemsBeingEdited] = useState<Set<string>>(
    new Set()
  );
  const [isEditing, setIsEditing] = useState(false);

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
    if (isEditing) {
      return;
    }
    const elements = results.map((elem) => {
      if (elem.groupIds) {
        elem.groupIds = Object.values(elem.groupIds);
      } else {
        elem.groupIds = [];
      }
      if (elem.points && typeof elem.points === 'string') {
        elem.points = JSON.parse(elem.points);
      }
      if (elem.boundElements) {
        elem.boundElements = Object.values(elem.boundElements);
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
      elements: elements.map(({ fracIndex, ...elem }) => elem),
    };
    // Set prev state here so we wont trigger sync on DB updates
    const normalizedState = normalizeElements(elements);
    prevState.current = normalizedState;
    excalidrawAPI.updateScene(scene);
  }, [results, excalidrawAPI, isEditing]);

  const onChange = useCallback(
    async (elements) => {
      let latestElements = elements;
      const pageId = currentPageId;
      latestElements = latestElements.map((elem, i) => {
        const prevElemState = prevState.current[elem.id];
        if (!prevElemState) {
          return { ...elem };
        }
        // if (!prevElemState.fracIndex) throw new Error('missing fracIndex');
        return { ...elem, fracIndex: prevElemState.fracIndex };
      });
      assignFractionalIndices(latestElements);
      const normalizedState = normalizeElements(latestElements);
      const changes = Value.Diff(prevState.current, normalizedState);
      if (!changes || changes.length === 0) return;
      if (isEditing) {
        setElemsBeingEdited((prev) => {
          const newSet = new Set(prev);
          changes.forEach((change) => {
            if (change.type === 'insert') {
              newSet.add(change.path.split('/')[1]);
            } else if (change.type === 'update') {
              newSet.add(change.path.split('/')[1]);
            }
          });
          return newSet;
        });
      }
      try {
        await client.transact(async (tx) => {
          for (const change of changes) {
            // hack to handle inserts that are actually updates like
            // {type: 'insert', path: '/BpjfOZcnTuWfH0p3OA48L/points/2', value: Array(2)}
            if (change.type === 'insert' && change.path.split('/').length > 2) {
              change.type = 'update';
            }
            if (change.type === 'insert') {
              const elementDoc = Value.Patch({}, [change]);
              const [id, element] = Object.entries(elementDoc)[0];
              if ('points' in element) {
                element.points = JSON.stringify(element.points);
              }
              await tx.insert('elements', { ...element, pageId, id });
            } else if (change.type === 'update') {
              if (change?.value === undefined) {
                continue;
              }
              // console.log('change', change);
              const [entityId, ...pathArr] = change.path.split('/').slice(1);
              const lastPath = pathArr.pop();
              await tx.update('elements', entityId, async (entity) => {
                // console.log('updating elem', entity, change);
                let scope = entity;
                let points;
                for (const path of pathArr) {
                  if (path === 'points') {
                    if (typeof scope[path] === 'string') {
                      points = JSON.parse(scope[path]);
                    } else {
                      points = scope[path];
                    }
                    scope = points;
                  } else {
                    scope = scope[path];
                  }
                }
                scope[lastPath] = change.value;

                if (points) {
                  entity.points = JSON.stringify(
                    // There might be something wrong with the proxy
                    // E.g. it looks like there will be an array of length 4
                    // but only 3 elements/points in it
                    points.filter((point) => !!point)
                  );
                }
              });
            }
          }
        });
        prevState.current = normalizedState;
      } catch (e) {
        console.error(e);
        // Rollback elements to previous state
        // Might be even better to query the db for the latest and reset the scene that way
        const rollbackElements = Object.values(prevState.current ?? {});
        const scene = {
          elements: rollbackElements,
        };
        excalidrawAPI?.updateScene(scene);
      }
    },
    [currentPageId, excalidrawAPI, isEditing]
  );

  function assignFractionalIndices(
    elements: { fracIndex?: string }[],
    prevIndex?: string
  ): string | undefined {
    if (elements.length === 0) return undefined;
    const [currElem, ...rest] = elements;
    if (currElem.fracIndex) {
      const greaterThanPrev = !prevIndex || prevIndex < currElem.fracIndex;
      const isLessThanNext =
        rest.length === 0 ||
        (rest[0].fracIndex && currElem.fracIndex < rest[0].fracIndex);
      if (greaterThanPrev && isLessThanNext) {
        assignFractionalIndices(rest, currElem.fracIndex);
        return currElem.fracIndex;
      }
    }
    currElem.fracIndex = generateKeyBetween(
      prevIndex,
      // make sure to include prev index as min so we dont gen out of order keys
      assignFractionalIndices(rest, prevIndex)
    );
    return currElem.fracIndex;
  }

  const excalidrawCanvas = useMemo(() => {
    return (
      <Excalidraw
        onChange={onChange}
        excalidrawAPI={excalidrawRefCallback}
        isCollaborating
        onPointerDown={() => {
          setIsEditing(true);
          setElemsBeingEdited(new Set());
        }}
        onPointerUpdate={({ button }) => {
          if (button === 'up') {
            setIsEditing(false);
            setElemsBeingEdited(new Set());
          }
        }}
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
    );
  }, [onChange, excalidrawRefCallback]);

  return (
    <div className="flex flex-col w-[100vw] h-[100vh]">
      <div className="w-[100vw] bg-zinc-900 flex flex-row justify-between items-center py-2 px-2 gap-3">
        <PageManagementMenu pages={pages ?? []} />
        <SyncStateIndicator />
      </div>
      <div className="relative grow">
        <WelcomeOverlay pages={pages ?? []} />
        {excalidrawCanvas}
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
