import { beforeAll, describe, expect, it } from 'vitest';
import DB from '../../src/db.js';
import { Schema as S } from '../../src/schema/builder.js';
import {
  IncludedNonRelationError,
  InvalidSelectClauseError,
  RelationDoesNotExistError,
} from '../../src/errors.js';

const todosSchema = {
  collections: {
    todos: {
      schema: S.Schema({
        id: S.Id(),
        title: S.String(),
        completed: S.Boolean(),
        assignee_id: S.Optional(S.String()),
        assignee: S.RelationById('users', '$assignee_id'),
      }),
    },
    users: {
      schema: S.Schema({
        id: S.Id(),
        name: S.String(),
      }),
    },
  },
};

const musicSchema = {
  collections: {
    songs: {
      schema: S.Schema({
        id: S.Id(),
        title: S.String(),
        album_id: S.String(),
        album: S.RelationById('albums', '$album_id'),
      }),
    },
    albums: {
      schema: S.Schema({
        id: S.Id(),
        title: S.String(),
        artist_id: S.String(),
        artist: S.RelationById('artists', '$artist_id'),
        review_ids: S.Set(S.String()),
        reviews: S.RelationMany('reviews', {
          where: [['id', 'in', '$review_ids']],
        }),
      }),
    },
    artists: {
      schema: S.Schema({
        id: S.Id(),
        name: S.String(),
        genre_id: S.String(),
        genre: S.RelationById('genres', '$genre_id'),
      }),
    },
    genres: {
      schema: S.Schema({
        id: S.Id(),
        name: S.String(),
      }),
    },
    reviews: {
      schema: S.Schema({
        id: S.Id(),
        album_id: S.String(),
        album: S.RelationById('albums', '$album_id'),
        rating: S.Number(),
        body: S.String(),
      }),
    },
  },
};

async function seedMusicData(db: DB<typeof musicSchema.collections>) {
  // Insert rock data
  await db.insert('genres', { id: '1', name: 'Rock' });
  await db.insert('artists', {
    id: '1',
    name: 'Led Zeppelin',
    genre_id: '1',
  });
  await db.insert('albums', {
    id: '1',
    title: 'Led Zeppelin IV',
    artist_id: '1',
    review_ids: new Set(['1', '2']),
  });
  await db.insert('songs', {
    id: '1',
    title: 'Stairway to Heaven',
    album_id: '1',
  });
  await db.insert('songs', { id: '2', title: 'Black Dog', album_id: '1' });
  await db.insert('reviews', {
    id: '1',
    album_id: '1',
    rating: 5,
    body: 'Great album',
  });
  await db.insert('reviews', {
    id: '2',
    album_id: '1',
    rating: 4,
    body: 'Pretty good',
  });
  await db.insert('artists', {
    id: '2',
    name: 'The Beatles',
    genre_id: '1',
  });
  await db.insert('albums', {
    id: '2',
    title: 'Abbey Road',
    artist_id: '2',
    review_ids: new Set(['3']),
  });
  await db.insert('songs', {
    id: '3',
    title: 'Come Together',
    album_id: '2',
  });
  await db.insert('reviews', {
    id: '3',
    album_id: '2',
    rating: 5,
    body: 'Great album',
  });

  await db.insert('genres', { id: '2', name: 'Rap' });
  await db.insert('artists', {
    id: '3',
    name: 'Kendrick Lamar',
    genre_id: '2',
  });
  await db.insert('albums', {
    id: '3',
    title: 'To Pimp a Butterfly',
    artist_id: '3',
    review_ids: new Set(['4']),
  });
  await db.insert('songs', {
    id: '4',
    title: 'Alright',
    album_id: '3',
  });
  await db.insert('reviews', {
    id: '4',
    album_id: '3',
    rating: 5,
    body: 'Great album',
  });

  await db.insert('artists', {
    id: '4',
    name: 'Schoolboy Q',
    genre_id: '2',
  });
  await db.insert('albums', {
    id: '4',
    title: 'Oxymoron',
    artist_id: '4',
    review_ids: new Set(['5']),
  });
  await db.insert('songs', {
    id: '5',
    title: 'Man of the Year',
    album_id: '4',
  });
  await db.insert('reviews', {
    id: '5',
    album_id: '4',
    rating: 5,
    body: 'Great album',
  });
}

describe('schemaful', () => {
  describe('field selection', () => {
    it('should select all fields if no selection is provided', async () => {
      const db = new DB({ schema: todosSchema });
      await db.insert('todos', { id: '1', title: 'foo', completed: false });
      const query = db.query('todos').build();
      const result = await db.fetchOne(query);
      expect(result).toEqual({ id: '1', title: 'foo', completed: false });
    });

    it('should select only the fields that are provided, with inclusion', async () => {
      const db = new DB({ schema: todosSchema });
      await db.insert('todos', {
        id: '1',
        title: 'foo',
        completed: false,
        assignee_id: '1',
      });
      await db.insert('users', { id: '1', name: 'bar' });
      const query = db.query('todos').include('assignee').build();
      const result = await db.fetchOne(query);
      expect(result).toEqual({
        id: '1',
        title: 'foo',
        completed: false,
        assignee_id: '1',
        assignee: { id: '1', name: 'bar' },
      });
    });

    it('should select only the fields that are provided', async () => {
      const db = new DB({ schema: todosSchema });
      await db.insert('todos', { id: '1', title: 'foo', completed: false });
      const query = db.query('todos').select(['id', 'title']).build();
      const result = await db.fetchOne(query);
      expect(result).toEqual({ id: '1', title: 'foo' });
    });

    it('will throw error if selecting a field that does not exist', async () => {
      const db = new DB({ schema: todosSchema });
      await db.insert('todos', { id: '1', title: 'foo', completed: false });
      const query = db
        .query('todos')
        .select([
          'id',
          'title',
          // @ts-expect-error
          'foo',
        ])
        .build();
      await expect(db.fetchOne(query)).rejects.toThrow(
        InvalidSelectClauseError
      );
    });

    it('can select _metadata collection', async () => {
      const db = new DB({ schema: todosSchema });
      const query = db
        .query(
          // @ts-expect-error
          '_metadata'
        )
        .where('id', '=', '_schema')
        .build();
      const result = await db.fetchOne(
        // @ts-expect-error

        query
      );
      const collectionKeys = Object.keys(
        // @ts-expect-error
        result?.collections
      );
      expect(collectionKeys.length).toBe(2);
      expect(collectionKeys).toContain('todos');
      expect(collectionKeys).toContain('users');
    });
  });

  describe('subquery selection', () => {
    const db = new DB({ schema: musicSchema });
    beforeAll(async () => await seedMusicData(db));
    describe('shorthand', () => {
      it('can include a relationship by name', async () => {
        const EXPECTED_RESULT = new Map([
          [
            '1',
            {
              id: '1',
              title: 'Led Zeppelin IV',
              artist_id: '1',
              artist: { id: '1', name: 'Led Zeppelin', genre_id: '1' },
              review_ids: new Set(['1', '2']),
            },
          ],
          [
            '2',
            {
              id: '2',
              title: 'Abbey Road',
              artist_id: '2',
              artist: { id: '2', name: 'The Beatles', genre_id: '1' },
              review_ids: new Set(['3']),
            },
          ],
          [
            '3',
            {
              id: '3',
              title: 'To Pimp a Butterfly',
              artist_id: '3',
              artist: { id: '3', name: 'Kendrick Lamar', genre_id: '2' },
              review_ids: new Set(['4']),
            },
          ],
          [
            '4',
            {
              id: '4',
              title: 'Oxymoron',
              artist_id: '4',
              artist: { id: '4', name: 'Schoolboy Q', genre_id: '2' },
              review_ids: new Set(['5']),
            },
          ],
        ]);

        // Builder
        {
          const query = db.query('albums').include('artist').build();
          const result = await db.fetch(query);
          expect(result).toEqual(EXPECTED_RESULT);
        }

        // Raw query (true)
        {
          const result = await db.fetch({
            collectionName: 'albums',
            include: { artist: true },
          });
          expect(result).toEqual(EXPECTED_RESULT);
        }

        // Raw query (null)
        {
          const result = await db.fetch({
            collectionName: 'albums',
            include: { artist: null },
          });
          expect(result).toEqual(EXPECTED_RESULT);
        }
      });

      it('will throw if including a relationship that does not exist', async () => {
        const query = db
          .query('albums')
          .include(
            // @ts-expect-error
            'foo'
          )
          .build();
        expect(db.fetch(query)).rejects.toThrow(RelationDoesNotExistError);
        expect(
          db.fetch({ collectionName: 'albums', include: { foo: true } })
        ).rejects.toThrow(RelationDoesNotExistError);
      });
    });

    describe('rel subqueries', () => {
      it('can extend a relation on the schema with a rel subquery', async () => {
        const EXPECTED_RESULT = new Map([
          [
            '1',
            {
              id: '1',
              title: 'Led Zeppelin IV',
              artist_id: '1',
              review_ids: new Set(['1', '2']),
              top_reviews: new Map([
                [
                  '1',
                  { id: '1', album_id: '1', rating: 5, body: 'Great album' },
                ],
              ]),
            },
          ],
          [
            '2',
            {
              id: '2',
              title: 'Abbey Road',
              artist_id: '2',
              review_ids: new Set(['3']),
              top_reviews: new Map([
                [
                  '3',
                  { id: '3', album_id: '2', rating: 5, body: 'Great album' },
                ],
              ]),
            },
          ],
          [
            '3',
            {
              id: '3',
              title: 'To Pimp a Butterfly',
              artist_id: '3',
              review_ids: new Set(['4']),
              top_reviews: new Map([
                [
                  '4',
                  { id: '4', album_id: '3', rating: 5, body: 'Great album' },
                ],
              ]),
            },
          ],
          [
            '4',
            {
              id: '4',
              title: 'Oxymoron',
              artist_id: '4',
              review_ids: new Set(['5']),
              top_reviews: new Map([
                [
                  '5',
                  { id: '5', album_id: '4', rating: 5, body: 'Great album' },
                ],
              ]),
            },
          ],
        ]);

        // Builder
        {
          const query = db
            .query('albums')
            .include('top_reviews', (rel) =>
              rel('reviews').order(['rating', 'DESC']).limit(1).build()
            )
            .build();
          const result = await db.fetch(query);
          expect(result).toEqual(EXPECTED_RESULT);
        }

        // raw query in builder
        {
          const query = db
            .query('albums')
            .include('top_reviews', {
              _rel: 'reviews',
              order: [['rating', 'DESC']],
              limit: 1,
            })
            .build();
          const result = await db.fetch(query);
          expect(result).toEqual(EXPECTED_RESULT);
        }

        // raw query
        {
          const result = await db.fetch({
            collectionName: 'albums',
            include: {
              top_reviews: {
                _rel: 'reviews',
                order: [['rating', 'DESC']],
                limit: 1,
              },
            },
          });
          expect(result).toEqual(EXPECTED_RESULT);
        }
      });

      it('can perform deep nesting', async () => {
        const EXPECTED_RESULT = new Map([
          [
            '1',
            {
              id: '1',
              title: 'Stairway to Heaven',
              album_id: '1',
              album: {
                id: '1',
                title: 'Led Zeppelin IV',
                artist_id: '1',
                artist: {
                  id: '1',
                  name: 'Led Zeppelin',
                  genre_id: '1',
                  // genre: { id: '1', name: 'Rock' },
                },
                artist_genre: {
                  genre: { id: '1', name: 'Rock' },
                },
                review_ids: new Set(['1', '2']),
              },
            },
          ],
        ]);

        // Builder
        {
          const query = db
            .query('songs')
            .include('album', (rel) =>
              rel('album')
                .include('artist')
                .include('artist_genre', (rel) =>
                  rel('artist').select([]).include('genre').build()
                )
                .build()
            )
            .id('1')
            .build();
          const result = await db.fetch(query);
          expect(result).toEqual(EXPECTED_RESULT);
        }

        // raw query in builder
        {
          const query = db
            .query('songs')
            .include('album', {
              _rel: 'album',
              include: {
                artist: true,
                artist_genre: {
                  _rel: 'artist',
                  select: [],
                  include: {
                    genre: true,
                  },
                },
              },
            })
            .id('1')
            .build();
          const result = await db.fetch(query);
          expect(result).toEqual(EXPECTED_RESULT);
        }

        // raw query
        {
          const result = await db.fetch({
            collectionName: 'songs',
            include: {
              album: {
                _rel: 'album',
                include: {
                  artist: true,
                  artist_genre: {
                    _rel: 'artist',
                    select: [],
                    include: {
                      genre: true,
                    },
                  },
                },
              },
            },
            where: [['id', '=', '1']],
          });
          expect(result).toEqual(EXPECTED_RESULT);
        }
      });

      it('will throw if you try to load a non relation type', async () => {
        const query = db
          .query('albums')
          //@ts-expect-error
          .include('title', (rel) =>
            rel(
              // @ts-expect-error
              'title'
            ).build()
          )
          .build();
        expect(db.fetch(query)).rejects.toThrow(IncludedNonRelationError);
      });
    });

    describe('subquery selection', () => {
      it('can include a random subquery', async () => {
        const EXPECTED_RESULT = new Map([
          [
            '1',
            {
              id: '1',
              name: 'Rock',
              genre_artists: new Map([
                ['1', { name: 'Led Zeppelin' }],
                ['2', { name: 'The Beatles' }],
              ]),
            },
          ],
          [
            '2',
            {
              id: '2',
              name: 'Rap',
              genre_artists: new Map([
                ['3', { name: 'Kendrick Lamar' }],
                ['4', { name: 'Schoolboy Q' }],
              ]),
            },
          ],
        ]);

        // Builder
        {
          const query = db
            .query('genres')
            .subquery(
              'genre_artists',
              db
                .query('artists')
                .select(['name'])
                .where('genre_id', '=', '$1.id')
                .build()
            )
            .build();
          const result = await db.fetch(query);
          expect(result).toEqual(EXPECTED_RESULT);
        }

        // raw query in builder
        {
          const query = db
            .query('genres')
            .subquery('genre_artists', {
              collectionName: 'artists',
              select: ['name'],
              where: [['genre_id', '=', '$1.id']],
            })
            .build();
          const result = await db.fetch(query);
          expect(result).toEqual(EXPECTED_RESULT);
        }

        // raw query
        {
          const result = await db.fetch({
            collectionName: 'genres',
            include: {
              genre_artists: {
                subquery: {
                  collectionName: 'artists',
                  select: ['name'],
                  where: [['genre_id', '=', '$1.id']],
                },
                cardinality: 'many',
              },
            },
          });
          expect(result).toEqual(EXPECTED_RESULT);
        }
      });
    });
  });
});

describe('schemaless', () => {
  it('should select all fields if no selection is provided', async () => {
    const db = new DB();
    await db.insert('todos', { id: '1', title: 'foo', completed: false });
    const query = db.query('todos').build();
    const result = await db.fetchOne(query);
    expect(result).toEqual({ id: '1', title: 'foo', completed: false });
  });

  it('should select only the fields that are provided, with inclusion', async () => {
    const db = new DB();
    await db.insert('todos', {
      id: '1',
      title: 'foo',
      completed: false,
      assignee_id: '1',
    });
    await db.insert('users', { id: '1', name: 'bar' });
    const query = db
      .query('todos')
      .subquery(
        'assignee',
        db.query('users').where('id', '=', '$1.assignee_id').build(),
        'one'
      )
      .build();
    const result = await db.fetchOne(query);
    expect(result).toEqual({
      id: '1',
      title: 'foo',
      completed: false,
      assignee_id: '1',
      assignee: { id: '1', name: 'bar' },
    });
  });

  it('should select only the fields that are provided', async () => {
    const db = new DB();
    await db.insert('todos', { id: '1', title: 'foo', completed: false });
    const query = db.query('todos').select(['id', 'title']).build();
    const result = await db.fetchOne(query);
    expect(result).toEqual({ id: '1', title: 'foo' });
  });

  it('will return undefined at field that does not exist', async () => {
    const db = new DB();
    await db.insert('todos', { id: '1', title: 'foo', completed: false });
    const query = db.query('todos').select(['id', 'title', 'foo']).build();
    const result = await db.fetchOne(query);
    expect(result).toEqual({ id: '1', title: 'foo', foo: undefined });
  });
});
