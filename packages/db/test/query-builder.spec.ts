import { it, expect } from 'vitest';
import { DB } from '../src/db.ts';

it('query builder doesnt overwrite previous builder objects', async () => {
  const db = new DB();
  const originalBuilder = db
    .query('test')
    .Id('123')
    .SubqueryMany('foo', { collectionName: 'bar' })
    .Limit(10)
    .Order('name', 'ASC')
    .After(['1', '1'])
    .Select(['id', 'name'])
    .Vars({ foo: 'bar' })
    .Where(['name', '=', 'foo']);

  const updatedBuilder = originalBuilder
    .Id('234')
    .SubqueryOne('bar', { collectionName: 'baz' })
    .Limit(20)
    .Order('name', 'DESC')
    .After(['2', '2'])
    .Select(['id', 'name', 'age'])
    .Vars({ bar: 'baz' })
    .Where(['age', '=', 21]);

  expect(originalBuilder).toEqual({
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
    vars: { foo: 'bar' },
    where: [
      ['id', '=', '123'],
      ['name', '=', 'foo'],
    ],
  });

  expect(updatedBuilder).toEqual({
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
    vars: { bar: 'baz' },
    where: [
      ['name', '=', 'foo'],
      ['id', '=', '234'],
      ['age', '=', 21],
    ],
  });
});
