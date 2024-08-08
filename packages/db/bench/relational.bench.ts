import Bench from 'tinybench';
import DB, { Schema as S } from '../src';

const db = new DB({
  schema: {
    collections: {
      cars: {
        schema: S.Schema({
          id: S.String(),
          year: S.Number(),
          model: S.String(),
          manufacturerId: S.String(),
          type: S.String(),
          manufacturer: S.RelationById('manufacturers', '$manufacturerId'),
        }),
      },
      manufacturers: {
        schema: S.Schema({
          id: S.String(),
          name: S.String(),
          country: S.String(),
          cars: S.RelationMany('cars', {
            where: [['manufacturerId', '=', '$id']],
          }),
        }),
      },
    },
  },
});
// const db = new DB({});

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
  { year: 2021, model: 'F150', manufacturerId: 'ford', type: 'truck' },
  { year: 2022, model: 'Fusion', manufacturerId: 'ford', type: 'sedan' },
  { year: 2022, model: 'Explorer', manufacturerId: 'ford', type: 'SUV' },
  { year: 2022, model: 'Camry', manufacturerId: 'toyota', type: 'sedan' },
  { year: 2021, model: 'Tacoma', manufacturerId: 'toyota', type: 'truck' },
  { year: 2021, model: 'Civic', manufacturerId: 'honda', type: 'sedan' },
  { year: 2022, model: 'Accord', manufacturerId: 'honda', type: 'sedan' },
  { year: 2022, model: 'Jetta', manufacturerId: 'vw', type: 'sedan' },
  { year: 2023, model: 'Atlas', manufacturerId: 'vw', type: 'truck' },
  { year: 2022, model: 'Tiguan', manufacturerId: 'vw', type: 'SUV' },
];
for (let i = 0; i < 1000; i++) {
  // Add  a randomly generated car
  const manufacturerId = ['ford', 'toyota', 'honda', 'vw'][
    Math.floor(Math.random() * 4)
  ];
  const type = ['sedan', 'truck', 'SUV'][Math.floor(Math.random() * 3)];
  const year = 2020 + Math.floor(Math.random() * 5);
  const model = `${type}-${year}-${i}`;
  cars.push({ year, model, manufacturerId, type });
}

for (const car of cars) {
  await db.insert('cars', { ...car, id: `${car.manufacturerId}-${car.model}` });
}

/**
 * Log the time it takes for the first and second query to run of the 3-level query
 */
const threeLevelsQuery = db
  .query('cars')
  .where('manufacturer.cars.type', '=', 'SUV')
  .build();

let start = performance.now();
const results = await db.fetch(threeLevelsQuery);
let end = performance.now();
console.log(`Triplit first query: ${end - start}ms`);
start = performance.now();
await db.fetch(threeLevelsQuery);
end = performance.now();
console.log(`Triplit second query: ${end - start}ms`);

const bench = new Bench({ signal: controller.signal });

bench
  .add('triplt one level', async () => {
    const query = db.query('cars').where('type', '=', 'SUV').build();
    await db.fetch(query);
  })
  .add('triplit two level', async () => {
    const query = db
      .query('manufacturers')
      .where('cars.type', '=', 'SUV')
      .build();
    await db.fetch(query);
  })
  .add('triplit three level', async () => {
    await db.fetch(threeLevelsQuery);
  });

bench.addEventListener('error', (e) => {
  console.error(e);
  controller.abort();
});

await bench.run();
console.table(bench.table());
