import { Bench } from 'tinybench';
import { DB as TriplitDB, Schema as S } from '@triplit/entity-db';
import { TriplitClient } from '../src';

const schema = S.Collections({
  cars: {
    schema: S.Schema({
      id: S.Id(),
      year: S.Number(),
      model: S.String(),
      manufacturerId: S.String(),
      type: S.String(),
    }),
    relationships: {
      manufacturer: S.RelationById('manufacturers', '$manufacturerId'),
    },
  },
  manufacturers: {
    schema: S.Schema({
      id: S.String(),
      name: S.String(),
      country: S.String(),
    }),
    relationships: {
      cars: S.RelationMany('cars', {
        where: [['manufacturerId', '=', '$id']],
      }),
    },
  },
});

const db = new TriplitDB({
  schema: {
    collections: schema,
  },
});
const client = new TriplitClient({ schema });

const MANUFACTURERS = [
  { name: 'Ford', country: 'USA', id: 'ford' },
  { name: 'Toyota', country: 'Japan', id: 'toyota' },
  { name: 'Honda', country: 'Japan', id: 'honda' },
  { name: 'Volkswagen', country: 'Germany', id: 'vw' },
];

const CARS = new Array(1e4).fill(null).map((_, i) => {
  return {
    year: 2021 + (i % 3),
    model: 'Model ' + i,
    manufacturerId: MANUFACTURERS[i % 4].id,
    type: ['sedan', 'truck', 'SUV'][i % 3],
  };
});

for (const dbOrClient of [db, client]) {
  await dbOrClient.transact(async (tx) => {
    for (const manufacturer of MANUFACTURERS) {
      await tx.insert('manufacturers', manufacturer);
    }
    for (const car of CARS) {
      await tx.insert('cars', car);
    }
  });
}

const suite = new Bench();

const query = db.query('cars').Where([['year', '>', 2021]]);
suite
  .add('@triplit/entity-db', async () => {
    // Your benchmark code for @triplit/entity-db here
    await db.fetch(query);
  })
  .add('@triplit/client', async () => {
    // Your benchmark code for @triplit/client here
    await client.fetch(query);
  });

await suite.run();

console.table(suite.table());
