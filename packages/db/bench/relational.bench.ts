import Bench from 'tinybench';
import DB from '../src/db.js';

const db = new DB({});

const controller = new AbortController();

await db.insert(
  'manufacturers',
  { name: 'Ford', country: 'USA', id: 'ford' },
  'ford'
);
await db.insert(
  'manufacturers',
  { name: 'Toyota', country: 'Japan', id: 'toyota' },
  'toyota'
);
await db.insert(
  'manufacturers',
  { name: 'Honda', country: 'Japan', id: 'honda' },
  'honda'
);
await db.insert(
  'manufacturers',
  { name: 'Volkswagen', country: 'Germany', id: 'vw' },
  'vw'
);
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
  await db.insert('cars', car, `${car.manufacturer}-${car.model}`);
}

/**
 * Log the time it takes for the first and second query to run of the 3-level query
 */
const query = db
  .query('cars')
  .where([
    {
      exists: db
        .query('manufacturers')
        .where([
          ['id', '=', '$manufacturer'],
          {
            exists: db
              .query('cars')
              .where([
                ['type', '=', 'SUV'],
                ['manufacturer', '=', '$id'],
              ])
              .build(),
          },
        ])
        .build(),
    },
  ])
  .build();

let start = performance.now();
await db.fetch(query);
let end = performance.now();
console.log(`Triplit first query: ${end - start}ms`);
start = performance.now();
await db.fetch(query);
end = performance.now();
console.log(`Triplit second query: ${end - start}ms`);

const bench = new Bench({ signal: controller.signal });

bench
  .add('triplt one level', async () => {
    const query = db
      .query('cars')
      .vars({ type: 'SUV' })
      .where([['type', '=', '$type']])
      .build();
    await db.fetch(query);
    // console.log(await db.fetch(query));
  })
  .add('triplit two level', async () => {
    const query = db
      .query('manufacturers')
      .where([
        {
          exists: db
            .query('cars')
            .where([
              ['type', '=', 'SUV'],
              ['manufacturer', '=', '$id'],
            ])
            .build(),
        },
      ])
      .build();
    await db.fetch(query);
    // console.log(await db.fetch(query));
  })
  .add('triplit three level', async () => {
    const query = db
      .query('cars')
      .where([
        {
          exists: db
            .query('manufacturers')
            .where([
              ['id', '=', '$manufacturer'],
              {
                exists: db
                  .query('cars')
                  .where([
                    ['type', '=', 'SUV'],
                    ['manufacturer', '=', '$id'],
                  ])
                  .build(),
              },
            ])
            .build(),
        },
      ])
      .build();

    await db.fetch(query);
  });

bench.addEventListener('error', (e) => {
  console.error(e);
  controller.abort();
});

await bench.run();
console.table(bench.table());
