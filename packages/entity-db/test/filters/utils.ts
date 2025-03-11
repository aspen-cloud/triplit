import { expect } from 'vitest';
import { DB, DBSchema, Models } from '../../src';

// Maybe join TestOptions and TestDefinition?
type TestOptions = {
  engine: {};
};

// If we have options for the query engine, pass these in here to inform the describe.each param
export const TEST_OPTIONS: TestOptions[] = [{ engine: {} }];

type TestDefinition = {
  cmp: any;
  expected: any[];
};

export function genData(attrs: any[]) {
  return attrs.map((attr, i) => ({ attr, _idx: i }));
}

export function expectArrayHasExactly(a: any[], b: any[]) {
  expect(a.slice().sort()).toEqual(b.slice().sort());
}

function originalIdxs(data: any[]) {
  return data.map((v) => v._idx);
}

export async function testEq<M extends Models<M>>(
  schema: Pick<DBSchema<M>, 'collections'>,
  data: any[],
  test: TestDefinition,
  options: TestOptions
) {
  await testFilterOp('=', schema, data, test, options);
}

export async function testNEq<M extends Models<M>>(
  schema: Pick<DBSchema<M>, 'collections'>,
  data: any[],
  test: TestDefinition,
  options: TestOptions
) {
  await testFilterOp('!=', schema, data, test, options);
}

export async function testGt<M extends Models<M>>(
  schema: Pick<DBSchema<M>, 'collections'>,
  data: any[],
  test: TestDefinition,
  options: TestOptions
) {
  await testFilterOp('>', schema, data, test, options);
}

export async function testGte<M extends Models<M>>(
  schema: Pick<DBSchema<M>, 'collections'>,
  data: any[],
  test: TestDefinition,
  options: TestOptions
) {
  await testFilterOp('>=', schema, data, test, options);
}

export async function testLt<M extends Models<M>>(
  schema: Pick<DBSchema<M>, 'collections'>,
  data: any[],
  test: TestDefinition,
  options: TestOptions
) {
  await testFilterOp('<', schema, data, test, options);
}

export async function testLte<M extends Models<M>>(
  schema: Pick<DBSchema<M>, 'collections'>,
  data: any[],
  test: TestDefinition,
  options: TestOptions
) {
  await testFilterOp('<=', schema, data, test, options);
}

export async function testIn<M extends Models<M>>(
  schema: Pick<DBSchema<M>, 'collections'>,
  data: any[],
  test: TestDefinition,
  options: TestOptions
) {
  await testFilterOp('in', schema, data, test, options);
}

export async function testNIn<M extends Models<M>>(
  schema: Pick<DBSchema<M>, 'collections'>,
  data: any[],
  test: TestDefinition,
  options: TestOptions
) {
  await testFilterOp('nin', schema, data, test, options);
}

export async function testFilterOp<M extends Models<M>>(
  operation: string,
  schema: Pick<DBSchema<M>, 'collections'>,
  data: any[],
  test: TestDefinition,
  options: TestOptions
) {
  const db = new DB({ schema });
  for (const item of data) {
    await db.insert('test', item);
  }
  const query = db.query('test').Where('attr', operation, test.cmp);
  const results = await db.fetch(query);
  expectArrayHasExactly(originalIdxs(results), test.expected);
}

export function shuffleArray(array: any[]) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
