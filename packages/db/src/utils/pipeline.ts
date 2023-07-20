type MapFunc<I, O> = (item: I, index: number) => Promise<O>;
type FilterFunc<I> = (item: I, index: number) => Promise<boolean>;

export class Pipeline<T> {
  limit = Infinity;
  stages: (['map', MapFunc<any, any>] | ['filter', FilterFunc<any>])[];
  constructor(
    // readonly source: Iterable<T>,
    readonly source: Array<T>, // TODO add iterator/generator suppr
    {
      stages,
      limit,
    }: {
      stages?: (['map', MapFunc<any, any>] | ['filter', FilterFunc<any>])[];
      limit?: number;
    } = {}
  ) {
    this.stages = stages ?? [];
    this.limit = limit ?? Infinity;
  }

  map<O>(mapFunc: MapFunc<T, O>) {
    // @ts-ignore not sure about best to store type info about original source
    return new Pipeline<O>(this.source, {
      stages: this.stages.concat([['map', mapFunc]]),
      limit: this.limit,
    });
  }

  tap(tapFunc: (item: T, index: number) => Promise<void> | void) {
    return new Pipeline<T>(this.source, {
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

  filter(filterFunc: FilterFunc<T>) {
    return new Pipeline<T>(this.source, {
      stages: this.stages.concat([['filter', filterFunc]]),
      limit: this.limit,
    });
  }

  take(limit: number) {
    return new Pipeline<T>(this.source, {
      stages: this.stages,
      limit,
    });
  }

  async toArray(): Promise<T[]> {
    let result = [];
    itemLoop: for (
      let i = 0;
      i < Math.min(this.source.length ?? Infinity, this.limit);
      i++
    ) {
      let item = this.source[i];
      stageLoop: for (const stage of this.stages) {
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
      result.push(item);
    }
    return result;
  }
}
