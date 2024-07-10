import { it, expect } from 'vitest';
import DB from '../src/db.ts';

it('query builder doesnt overwrite previous builder objects', async () => {
  const db = new DB();
  const originalBuilder = db
    .query('test')
    .id('123')
    .include('foo', {
      subquery: { collectionName: 'bar' },
      cardinality: 'many',
    })
    .limit(10)
    .order('name', 'ASC')
    .after(['1', '1'])
    .select(['id', 'name'])
    .vars({ foo: 'bar' })
    .where(['name', '=', 'foo']);

  const updatedBuilder = originalBuilder
    .id('234')
    .include('bar', {
      subquery: { collectionName: 'baz' },
      cardinality: 'one',
    })
    .limit(20)
    .order('name', 'DESC')
    .after(['2', '2'])
    .select(['id', 'name', 'age'])
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
    vars: { bar: 'baz' },
    where: [
      ['id', '=', '234'],
      ['name', '=', 'foo'],
      ['age', '=', 21],
    ],
  });
});
