import Bench from 'tinybench';
import DB, { Schema as S } from '../src';

const db = new DB({
  schema: {
    collections: {
      cars: {
        schema: S.Schema({
          id: S.Id(),
          year: S.Number(),
          model: S.String(),
          manufacturer: S.String(),
          type: S.String(),
        }),
      },
      manufacturers: {
        schema: S.Schema({
          id: S.Id(),
          name: S.String(),
          country: S.String(),
          cars: S.Query({
            collectionName: 'cars',
            where: [['manufacturer', '=', '$id']],
          }),
        }),
      },
    },
  },
});

const controller = new AbortController();

await db.insert('manufacturers', { name: 'Ford', country: 'USA', id: 'ford' });
await db.insert('manufacturers', {
  name: 'Toyota',
  country: 'Japan',
  id: 'toyota',
});
await db.insert('manufacturers', {
  name: 'Honda',
  country: 'Japan',
  id: 'honda',
});
await db.insert('manufacturers', {
  name: 'Volkswagen',
  country: 'Germany',
  id: 'vw',
});
// Cars - Contains a make, model, manufacturer, and class (like SUV)
const cars = [
  { year: 2021, model: 'F150', manufacturer: 'ford', type: 'truck' },
  { year: 2022, model: 'Fusion', manufacturer: 'ford', type: 'sedan' },
  { year: 2022, model: 'Explorer', manufacturer: 'ford', type: 'SUV' },
  { year: 2022, model: 'Camry', manufacturer: 'toyota', type: 'sedan' },
  { year: 2021, model: 'Tacoma', manufacturer: 'toyota', type: 'truck' },
  { year: 2021, model: 'Civic', manufacturer: 'honda', type: 'sedan' },
  { year: 2022, model: 'Accord', manufacturer: 'honda', type: 'sedan' },
  { year: 2022, model: 'Jetta', manufacturer: 'vw', type: 'sedan' },
  { year: 2023, model: 'Atlas', manufacturer: 'vw', type: 'truck' },
  { year: 2022, model: 'Tiguan', manufacturer: 'vw', type: 'SUV' },
];
for (let i = 0; i < 1000; i++) {
  // Add  a randomly generated car
  const manufacturer = ['ford', 'toyota', 'honda', 'vw'][
    Math.floor(Math.random() * 4)
  ];
  const type = ['sedan', 'truck', 'SUV'][Math.floor(Math.random() * 3)];
  const year = 2020 + Math.floor(Math.random() * 5);
  const model = `${type}-${year}-${i}`;
  cars.push({ year, model, manufacturer, type });
}

for (const car of cars) {
  await db.insert('cars', car);
}

console.log(`Querying across ${cars.length} cars`);
const bench = new Bench({ signal: controller.signal });
let log = true;
bench
  .add('simple filter', async () => {
    const query = db
      .query('cars')
      .vars({ type: 'SUV' })
      .where([['type', '=', '$type']])
      .build();
    await db.fetch(query);
  })
  .add('include relation', async () => {
    const query = db.query('manufacturers').include('cars').build();
    await db.fetch(query);
  })
  .add('include relation with filter', async () => {
    const query = db
      .query('manufacturers')
      .include('cars', { _rel: 'cars', where: [['type', '=', 'SUV']] })
      .build();

    await db.fetch(query);
  });

bench.addEventListener('error', (e) => {
  console.error(e);
  controller.abort();
});

await bench.run();
console.table(bench.table());
