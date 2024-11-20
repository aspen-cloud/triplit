export type MapFunc<I, O> = (item: I, index: number) => O | Promise<O>;
type MapTuple = ['map', MapFunc<any, any>];

export type FilterFunc<I> = (
  item: I,
  index: number
) => boolean | Promise<boolean>;
type FilterTuple = ['filter', FilterFunc<any>];

type AggregateFunc<I> = (items: I[]) => I[] | Promise<I[]>;
type AggregateTuple = [
  'aggregate',
  AggregateFunc<any>,
  { limit: number; takeWhile?: FilterFunc<any> },
];

type SortFunc<I> = (a: I, b: I) => number;

type StageTuple = MapTuple | FilterTuple | AggregateTuple;

export class Pipeline<T, R = T> {
  limit = Infinity;
  stages: StageTuple[];
  takeWhileFilter?: FilterFunc<R>;
  constructor(
    // readonly source: Iterable<T>,
    // readonly source: Array<T>, // TODO add iterator/generator suppr
    {
      stages,
      limit,
      takeWhile,
    }: {
      stages?: StageTuple[];
      limit?: number;
      takeWhile?: FilterFunc<R>;
    } = {}
  ) {
    this.stages = stages ?? [];
    this.limit = limit ?? Infinity;
    this.takeWhileFilter = takeWhile;
  }

  map<O>(mapFunc: MapFunc<R, O>) {
    return new Pipeline<T, O>({
      stages: this.stages.concat([['map', mapFunc]]),
      limit: this.limit,
    });
  }

  tap(tapFunc: (item: R, index: number) => Promise<void> | void) {
    return new Pipeline<T, R>({
      stages: this.stages.concat([
        [
          'map',
          async (item, i) => {
            await tapFunc(item, i);
            return item;
          },
        ],
      ]),
      limit: this.limit,
    });
  }

  takeWhile(filterFunc: FilterFunc<R>) {
    return new Pipeline<T, R>({
      takeWhile: filterFunc,
      stages: this.stages,
      limit: this.limit,
    });
  }

  filter(filterFunc: FilterFunc<R>) {
    return new Pipeline<T, R>({
      stages: this.stages.concat([['filter', filterFunc]]),
      limit: this.limit,
    });
  }

  take(limit: number) {
    return new Pipeline<T, R>({
      stages: this.stages,
      limit,
    });
  }

  sort(sortFunc: SortFunc<R>) {
    return new Pipeline<T, R>({
      stages: this.stages.concat([
        [
          'aggregate',
          async (items: R[]) => {
            return items.slice().sort(sortFunc);
          },
          { limit: this.limit, takeWhile: this.takeWhileFilter },
        ],
      ]),
    });
  }

  // takeWhile(fn: FilterFunc<T>) {
  //   return new Pipeline<T>(this.source, {
  //     stages: this.stages.concat([
  //       [
  //         'filter',
  //         async (item, i) => {
  //           return fn(item, i) && i < this.limit;
  //         },
  //       ],
  //     ]),
  //     limit: this.limit,
  //   });
  // }

  async run(source: T[] | Iterable<T> | AsyncIterable<T>) {
    this.stages.push([
      'aggregate',
      async (items: any[]) => items,
      { limit: this.limit, takeWhile: this.takeWhileFilter },
    ]);

    // Groups = [[...steps, aggregate], [...steps, aggregate], ...]
    const stageGroups = this.stages.reduce<StageTuple[][]>(
      (acc, stage, i, stages) => {
        const prev = stages[i - 1];
        if (prev && prev[0] === 'aggregate') {
          acc.push([stage]);
        } else {
          if (acc.length === 0) {
            acc.push([stage]);
          } else {
            acc[acc.length - 1].push(stage);
          }
        }
        return acc;
      },
      []
    );

    async function runStages(
      source: T[] | Iterable<T> | AsyncIterable<T>,
      stages: StageTuple[],
      context: { limit: number; takeWhile?: FilterFunc<T> }
    ) {
      let result = [];
      const limit = Math.min(
        source instanceof Array ? source.length : Infinity,
        context.limit
      );
      let i = 0;
      itemLoop: for await (let item of source) {
        stageLoop: for (const stage of stages) {
          const [stageType, func] = stage;
          if (stageType === 'map') {
            item = await func(item, i);
            continue;
          }
          if (stageType === 'filter') {
            if (await func(item, i)) {
              continue stageLoop;
            } else {
              continue itemLoop;
            }
          }
        }
        if (context.takeWhile && !context.takeWhile(item, i)) {
          break itemLoop;
        }
        result.push(item);
        if (result.length >= limit) {
          break itemLoop;
        }
        i++;
      }
      return result;
    }

    let result = source;
    for (const stageGroup of stageGroups) {
      const [_, aggregator, aggContext] = stageGroup.at(-1) as AggregateTuple;
      const pipeStages = stageGroup.slice(0, -1);
      result = await aggregator(
        await runStages(result, pipeStages, aggContext)
      );
    }

    return result;
  }
}
