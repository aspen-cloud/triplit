import {
  bench,
  run,
  summary,
  boxplot,
  lineplot,
  compact,
  do_not_optimize,
} from 'mitata';
import { nanoid } from 'nanoid';

interface Entity {
  id: string; // nanoid 21 characters
  date: Date; // 8 bytes
  age: number; // 4 bytes
}

interface EntityStrategy<SerializedForm> {
  serialize: (entity: Entity) => SerializedForm;
  deserialize: (bytes: SerializedForm) => Entity;
}

class BinaryEntity {
  binary: Uint8Array;
  view: DataView;
  _id: string;
  _date: Date;
  _age: number;
  constructor(binary: ArrayBuffer) {
    this.binary = new Uint8Array(binary);
    this.view = new DataView(binary);
  }

  get id() {
    return new TextDecoder().decode(this.binary.slice(0, 21));
  }

  get date() {
    if (!this._date) {
      this._date = new Date(this.view.getFloat64(22));
    }
    return this._date;
  }

  get age() {
    return this.view.getUint32(30);
  }

  toJSON() {
    return {
      id: this.id,
      date: this.date,
      age: this.age,
    };
  }
}

const LazyBinaryEntities: EntityStrategy<Uint8Array> = {
  // This effectively creates a binary struct for the entity
  // and stores it in a Uint8Array
  serialize: (entity) => {
    const buffer = new ArrayBuffer(34);
    const view = new DataView(buffer);
    // Add ID which is always 21 characters, date is 8 bytes, age is 4 bytes
    // add Id
    // view.setUint8(0, entity.id.length);
    let i = 0;
    for (; i < entity.id.length; i++) {
      view.setUint8(i, entity.id.charCodeAt(i));
    }
    // add date
    view.setFloat64(i + 1, entity.date.getTime());
    i += 8;

    // add age
    view.setUint32(i + 1, entity.age);

    return new Uint8Array(buffer);
  },
  // These creates a Proxy for the entity and lazily reads the
  // the values directly from the binary data
  deserialize: (bytes) => {
    // const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return new BinaryEntity(bytes.buffer);
    // return new Proxy<Entity>(
    //   {},
    //   {
    //     get(target, prop) {
    //       if (prop !== 'id' && prop !== 'date' && prop !== 'age') {
    //         throw new Error(`Unknown property: ${prop}`);
    //       }
    //       if (prop in target) {
    //         return target[prop];
    //       }
    //       if (prop === 'id') {
    //         return new TextDecoder().decode(bytes.slice(0, 21));
    //       }
    //       if (prop === 'date') {
    //         return new Date(view.getFloat64(22));
    //       }
    //       if (prop === 'age') {
    //         return view.getUint32(30);
    //       }
    //     },
    //   }
    // );
  },
};

const JSONEntities: EntityStrategy<string> = {
  serialize: (entity) => {
    return JSON.stringify(entity);
  },
  deserialize: (bytes) => {
    return JSON.parse(bytes);
  },
};

// const TEST_ENTITIES: Entity[] = Array.from({ length: 5 }, (_, i) => ({
//   id: nanoid(),
//   date: new Date(),
//   age: i,
// }));

// for (const entity of TEST_ENTITIES) {
//   const serialized = LazyBinaryEntities.serialize(entity);
//   const deserialized = LazyBinaryEntities.deserialize(serialized);
//   console.log(entity, serialized, deserialized);
// }
const NUM_ENTITIES = 10e3;
boxplot(() => {
  summary(() => {
    compact(() => {
      bench('JSON $percentReads%', function* (state) {
        yield* runBenchForStrategy(
          JSONEntities,
          NUM_ENTITIES,
          state.get('percentReads')
        );
      })
        .gc('inner')
        .dense_range('percentReads', 0, 100, 20);

      bench('Lazy Binary $percentReads%', function* (state) {
        yield* runBenchForStrategy(
          LazyBinaryEntities,
          NUM_ENTITIES,
          state.get('percentReads')
        );
      })
        .gc('inner')
        .dense_range('percentReads', 0, 100, 20);
    });
  });
});

function* runBenchForStrategy(
  strategy: EntityStrategy<any>,
  NUM_ENTITIES: number,
  percentReads: number
) {
  const entities = new Map(
    Array.from({ length: NUM_ENTITIES }, (_, i) => [
      i,
      strategy.serialize({
        id: nanoid(),
        date: new Date(),
        age: i,
      }),
    ])
  );

  const readEveryNEntity = Math.floor(
    NUM_ENTITIES / (NUM_ENTITIES * (percentReads / 100))
  );
  yield async () => {
    const results = new Array(NUM_ENTITIES);
    for (let i = 0; i < NUM_ENTITIES; i++) {
      const entity = strategy.deserialize(entities.get(i));
      do_not_optimize(entity.date);
      if (i % readEveryNEntity === 0) {
        results.push(entity);
      }
    }
    return results;
  };
}

await run();
