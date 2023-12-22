import DB from '@triplit/db';
import Bench from 'tinybench';

const bench = new Bench();

const db = new DB();
await db.transact(async (tx) => {
  for (let i = 0; i < 1000; i++) {
    // Insert a randomly generated class
    await tx.insert('classes', {
      id: i.toString(),
      level: Math.floor(Math.random() * 1000),
      name: `Class ${i}`,
    });
  }
});

console.log('Initial single read:');
{
  const start = performance.now();
  await db.fetchById('classes', '1');
  console.log('fetchById', performance.now() - start);
}
{
  const start = performance.now();
  await db.fetchOne(
    db
      .query('classes')
      .vars({ classId: '1' })
      .where([['id', '=', '$classId']])
      .build()
  );
  console.log('fetchOne variable', performance.now() - start);
}
{
  const start = performance.now();
  await db.fetchOne(
    db
      .query('classes')
      .where([['id', '=', '1']])
      .build()
  );
  console.log('fetchOne', performance.now() - start);
}

bench
  .add('fetchById', async () => {
    await db.fetchById('classes', '1');
  })
  .add('fetch where (variable)', async () => {
    await db.fetchOne(
      db
        .query('classes')
        .vars({ classId: '1' })
        .where([['id', '=', '$classId']])
        .build()
    );
  })
  .add('fetch where', async () => {
    await db.fetchOne(
      db
        .query('classes')
        .where([['id', '=', '1']])
        .build()
    );
  });

await bench.run();

console.table(bench.table());
