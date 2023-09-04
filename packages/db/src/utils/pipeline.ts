type MapFunc<I, O> = (item: I, index: number) => Promise<O>;
type FilterFunc<I> = (item: I, index: number) => Promise<boolean>;

export class Pipeline<T> {
  limit = Infinity;
  stages: (['map', MapFunc<any, any>] | ['filter', FilterFunc<any>])[];
  takeWhileFilter?: FilterFunc<T>;
  constructor(
    // readonly source: Iterable<T>,
    readonly source: Array<T>, // TODO add iterator/generator suppr
    {
      stages,
      limit,
      takeWhile,
    }: {
      stages?: (['map', MapFunc<any, any>] | ['filter', FilterFunc<any>])[];
      limit?: number;
      takeWhile?: FilterFunc<T>;
    } = {}
  ) {
    this.stages = stages ?? [];
    this.limit = limit ?? Infinity;
    this.takeWhileFilter = takeWhile;
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

  takeWhile(filterFunc: FilterFunc<T>) {
    return new Pipeline<T>(this.source, {
      takeWhile: filterFunc,
      stages: this.stages,
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

  async toArray(): Promise<T[]> {
    let result = [];
    const limit = Math.min(this.source.length ?? Infinity, this.limit);
    itemLoop: for (let i = 0; i < this.source.length; i++) {
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
      if (this.takeWhileFilter && !this.takeWhileFilter(item, i)) {
        break itemLoop;
      }
      result.push(item);

      if (result.length >= limit) {
        break itemLoop;
      }
    }
    return result;
  }
}
