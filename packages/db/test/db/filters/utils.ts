import { expect } from 'vitest';
import DB, { Models } from '../../../src/index.ts';
import { StoreSchema } from '../../../src/schema/types/models.ts';

// Maybe join TestOptions and TestDefinition?
type TestOptions = {
  skipIndex: boolean;
};

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

function originalIdxs(data: Map<string, any>) {
  return Array.from(data.values()).map((v) => v._idx);
}

export async function testEq<M extends Models>(
  schema: Pick<StoreSchema<M>, 'collections'>,
  data: any[],
  test: TestDefinition,
  options: TestOptions
) {
  await testFilterOp('=', schema, data, test, options);
}

export async function testNEq<M extends Models>(
  schema: Pick<StoreSchema<M>, 'collections'>,
  data: any[],
  test: TestDefinition,
  options: TestOptions
) {
  await testFilterOp('!=', schema, data, test, options);
}

export async function testGt<M extends Models>(
  schema: Pick<StoreSchema<M>, 'collections'>,
  data: any[],
  test: TestDefinition,
  options: TestOptions
) {
  await testFilterOp('>', schema, data, test, options);
}

export async function testGte<M extends Models>(
  schema: Pick<StoreSchema<M>, 'collections'>,
  data: any[],
  test: TestDefinition,
  options: TestOptions
) {
  await testFilterOp('>=', schema, data, test, options);
}

export async function testLt<M extends Models>(
  schema: Pick<StoreSchema<M>, 'collections'>,
  data: any[],
  test: TestDefinition,
  options: TestOptions
) {
  await testFilterOp('<', schema, data, test, options);
}

export async function testLte<M extends Models>(
  schema: Pick<StoreSchema<M>, 'collections'>,
  data: any[],
  test: TestDefinition,
  options: TestOptions
) {
  await testFilterOp('<=', schema, data, test, options);
}

export async function testIn<M extends Models>(
  schema: Pick<StoreSchema<M>, 'collections'>,
  data: any[],
  test: TestDefinition,
  options: TestOptions
) {
  await testFilterOp('in', schema, data, test, options);
}

export async function testNIn<M extends Models>(
  schema: Pick<StoreSchema<M>, 'collections'>,
  data: any[],
  test: TestDefinition,
  options: TestOptions
) {
  await testFilterOp('nin', schema, data, test, options);
}

export async function testFilterOp<M extends Models>(
  operation: string,
  schema: Pick<StoreSchema<M>, 'collections'>,
  data: any[],
  test: TestDefinition,
  options: TestOptions
) {
  const db = new DB({ schema });
  for (const item of data) {
    await db.insert('test', item);
  }
  const query = db.query('test').where('attr', operation, test.cmp).build();
  const results = await db.fetch(query, { skipIndex: options.skipIndex });
  expectArrayHasExactly(originalIdxs(results), test.expected);
}
