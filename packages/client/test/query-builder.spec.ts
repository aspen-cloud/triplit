import { it, expect } from 'vitest';
import { TriplitClient } from '../src/client/triplit-client.ts';

it('query builder doesnt overwrite previous builder objects', async () => {
  const client = new TriplitClient();
  const originalBuilder = client
    .query('test')
    .id('123')
    .subquery('foo', { collectionName: 'bar' }, 'many')
    .limit(10)
    .order('name', 'ASC')
    .after(['1', '1'])
    .select(['id', 'name'])
    .syncStatus('confirmed')
    .vars({ foo: 'bar' })
    .where(['name', '=', 'foo']);

  const updatedBuilder = originalBuilder
    .id('234')
    .subquery('bar', { collectionName: 'baz' }, 'one')
    .limit(20)
    .order('name', 'DESC')
    .after(['2', '2'])
    .select(['id', 'name', 'age'])
    .syncStatus('pending')
    .vars({ bar: 'baz' })
    .where(['age', '=', 21]);

  expect(originalBuilder.build()).toEqual({
    collectionName: 'test',
    after: [['1', '1'], false],
    include: {
      foo: {
        subquery: { collectionName: 'bar' },
        cardinality: 'many',
      },
    },
    limit: 10,
    order: [['name', 'ASC']],
    select: ['id', 'name'],
    syncStatus: 'confirmed',
    vars: { foo: 'bar' },
    where: [
      ['id', '=', '123'],
      ['name', '=', 'foo'],
    ],
  });

  expect(updatedBuilder.build()).toEqual({
    collectionName: 'test',
    after: [['2', '2'], false],
    include: {
      bar: {
        subquery: { collectionName: 'baz' },
        cardinality: 'one',
      },
      foo: {
        subquery: { collectionName: 'bar' },
        cardinality: 'many',
      },
    },
    limit: 20,
    order: [
      ['name', 'ASC'],
      ['name', 'DESC'],
    ],
    select: ['id', 'name', 'age'],
    syncStatus: 'pending',
    vars: { bar: 'baz' },
    where: [
      ['id', '=', '234'],
      ['name', '=', 'foo'],
      ['age', '=', 21],
    ],
  });
});
