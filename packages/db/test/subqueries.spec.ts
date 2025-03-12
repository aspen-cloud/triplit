import { DB } from '../src';
import { describe, beforeAll, it, expect, beforeEach } from 'vitest';
import { testSubscription } from './utils/test-subscription.js';
import { Schema as S } from '../src/schema/builder.js';
import { InvalidOrderClauseError } from '../src/errors.js';
/**
 * This tests the power of the query engine to handle complex relational queries
 * This test focuses on the classic graph example of aviation routes
 */
describe('Graph-like queries', () => {
  const db = new DB();
  beforeAll(async () => {
    // Insert a bunch of airplane, airport, and flights mock data
    // Airplanes - Contains a make, model, and capacity
    const airplanes = [
      { make: 'Boeing', model: '737', capacity: 200 },
      { make: 'Boeing', model: '747', capacity: 400 },
      { make: 'Airbus', model: 'A320', capacity: 200 },
      { make: 'Airbus', model: 'A380', capacity: 400 },
    ];
    for (const airplane of airplanes) {
      await db.insert('airplanes', {
        ...airplane,
        id: `${airplane.make}-${airplane.model}`,
      });
    }
    // Airports - Contains a name and location
    const airports = [
      { name: 'SFO', location: 'San Francisco, CA' },
      { name: 'LAX', location: 'Los Angeles, CA' },
      { name: 'JFK', location: 'New York, NY' },
      { name: 'ORD', location: 'Chicago, IL' },
    ];
    for (const airport of airports) {
      await db.insert('airports', airport);
    }
    // Flights - Contains a flight number, airplane, origin, and destination
    const flights = [
      {
        flight_number: 'UA-1',
        airplane: 'Boeing-737',
        origin: 'SFO',
        destination: 'JFK',
      },
      {
        flight_number: 'UA-2',
        airplane: 'Boeing-737',
        origin: 'JFK',
        destination: 'SFO',
      },
      {
        flight_number: 'UA-3',
        airplane: 'Boeing-747',
        origin: 'SFO',
        destination: 'ORD',
      },
      {
        flight_number: 'UA-4',
        airplane: 'Boeing-747',
        origin: 'ORD',
        destination: 'SFO',
      },
      {
        flight_number: 'UA-5',
        airplane: 'Airbus-A320',
        origin: 'SFO',
        destination: 'LAX',
      },
      {
        flight_number: 'UA-6',
        airplane: 'Airbus-A320',
        origin: 'LAX',
        destination: 'SFO',
      },
      {
        flight_number: 'UA-7',
        airplane: 'Airbus-A380',
        origin: 'SFO',
        destination: 'JFK',
      },
      {
        flight_number: 'UA-8',
        airplane: 'Airbus-A380',
        origin: 'JFK',
        destination: 'SFO',
      },
    ];
    for (const flight of flights) {
      await db.insert('flights', flight);
    }
  });

  it('can handle a deeply nested subquery', async () => {
    // Find all plane models that have flown to 'San Francisco, CA' from non-CA airports
    const query = db
      .query('airplanes')
      .Where([
        {
          exists: db.query('flights').Where([
            ['airplane', '=', '$1.id'],
            {
              exists: db.query('airports').Where([
                ['name', '=', '$1.origin'],
                ['location', 'nlike', '%, CA'],
                {
                  exists: db.query('airports').Where([
                    ['name', '=', '$2.destination'],
                    ['location', '=', 'San Francisco, CA'],
                  ]),
                },
              ]),
            },
          ]),
        },
      ])
      .Order(['id', 'ASC']);

    const result = await db.fetch(query);
    expect(result.map((e) => e.id)).toEqual([
      'Airbus-A380',
      'Boeing-737',
      'Boeing-747',
    ]);
  });
});

describe('selecting subqueries', () => {
  const db = new DB({
    schema: {
      collections: {
        users: {
          schema: S.Schema({
            id: S.String(),
            name: S.String(),
            friend_ids: S.Set(S.String(), { default: S.Default.Set.empty() }),
            liked_post_ids: S.Set(S.String(), {
              default: S.Default.Set.empty(),
            }),
          }),
        },
        posts: {
          schema: S.Schema({
            id: S.String(),
            content: S.String(),
            author_id: S.String(),
            topics: S.Set(S.String(), { default: S.Default.Set.empty() }),
          }),
        },
      },
    },
  });
  beforeAll(async () => {
    await db.insert('users', {
      id: 'user-1',
      name: 'Alice',
      friend_ids: new Set(['user-2', 'user-3']),
      liked_post_ids: new Set(['post-1']),
    });
    await db.insert('users', {
      id: 'user-2',
      name: 'Bob',
      friend_ids: new Set(['user-1', 'user-3']),
      liked_post_ids: new Set(['post-1']),
    });
    await db.insert('users', {
      id: 'user-3',
      name: 'Charlie',
      friend_ids: new Set(['user-1', 'user-2']),
      liked_post_ids: new Set(['post-1']),
    });
    await db.insert('posts', {
      id: 'post-1',
      content: 'Hello World!',
      author_id: 'user-1',
      topics: new Set(['comedy', 'sports']),
    });
    await db.insert('posts', {
      id: 'post-2',
      content: 'Hello World!',
      author_id: 'user-2',
    });
    await db.insert('posts', {
      id: 'post-3',
      content: 'Hello World!',
      author_id: 'user-3',
    });
  });
  it('can select subqueries', async () => {
    const query = db
      .query('users')
      .Select(['id'])
      .Select(['id'])
      .SubqueryMany('posts', db.query('posts').Where('author_id', '=', '$id'));
    const result = await db.fetch(query);

    expect(result.find((e) => e.id === 'user-1')).toHaveProperty('posts');
    expect(result.find((e) => e.id === 'user-1')!.posts).toHaveLength(1);
    expect(
      result
        .find((e) => e.id === 'user-1')!
        .posts.find((e) => e.id === 'post-1')
    ).toMatchObject({
      id: 'post-1',
      content: 'Hello World!',
      author_id: 'user-1',
      topics: new Set(['comedy', 'sports']),
    });
  });

  it('can set custom limits on subqueries', async () => {
    const query = db
      .query('users')
      .Select(['id'])
      .SubqueryMany('posts', db.query('posts').Limit(2));
    const result = await db.fetch(query);
    // Check each result has at most 2 posts
    for (const user of result) {
      expect(user.posts.length).toBeLessThanOrEqual(2);
    }
  });

  it('can select nested subqueries', async () => {
    const query = db
      .query('users')
      .Select(['id'])
      .SubqueryMany(
        'posts',
        db
          .query('posts')
          .Where('author_id', '=', '$1.id')
          .Select(['id'])
          .SubqueryMany(
            'likedBy',
            db.query('users').Where('liked_post_ids', 'has', '$1.id')
          )
      );
    const result = await db.fetch(query);
    expect(result.find((e) => e.id === 'user-1')).toHaveProperty('posts');
    expect(result.find((e) => e.id === 'user-1')!.posts).toHaveLength(1);
    expect(
      result
        .find((e) => e.id === 'user-1')!
        .posts.find((e) => e.id === 'post-1')!.likedBy
    ).toBeDefined();
    expect(
      result
        .find((e) => e.id === 'user-1')!
        .posts.find((e) => e.id === 'post-1')!.likedBy
    ).toHaveLength(3);
  });

  it('can subscribe with subqueries', async () => {
    const query = db
      .query('users')
      .Select(['id'])
      .SubqueryMany('posts', db.query('posts').Where('author_id', '=', '$id'));
    await testSubscription(db, query, [
      {
        check: (results) => {
          expect(results).toHaveLength(3);
          expect(results.find((e) => e.id === 'user-1')).toHaveProperty(
            'posts'
          );
          expect(results.find((e) => e.id === 'user-1')!.posts).toHaveLength(1);
          expect(
            results
              .find((e) => e.id === 'user-1')!
              .posts.find((e) => e.id === 'post-1')
          ).toMatchObject({
            id: 'post-1',
            content: 'Hello World!',
            author_id: 'user-1',
            topics: new Set(['comedy', 'sports']),
          });
        },
      },
      {
        action: async () => {
          await db.insert('posts', {
            id: 'post-4',
            content: 'Hello World!',
            author_id: 'user-1',
          });
        },
        check: (results) => {
          expect(results).toHaveLength(3);
          expect(results.find((e) => e.id === 'user-1')).toHaveProperty(
            'posts'
          );
          expect(results.find((e) => e.id === 'user-1')!.posts).toHaveLength(2);
          expect(
            results
              .find((e) => e.id === 'user-1')!
              .posts.find((e) => e.id === 'post-4')
          ).toMatchObject({
            id: 'post-4',
            content: 'Hello World!',
            author_id: 'user-1',
          });
        },
      },
    ]);
  });

  it('can select a singleton via a subquery', async () => {
    const query = db
      .query('users')
      .Select(['id'])
      .SubqueryOne(
        'favoritePost',
        db.query('posts').Where('author_id', '=', '$id')
      );
    const result = await db.fetch(query);
    expect(result.find((e) => e.id === 'user-1')).toHaveProperty(
      'favoritePost'
    );
    expect(result.find((e) => e.id === 'user-1')!.favoritePost).toMatchObject({
      id: 'post-1',
      content: 'Hello World!',
      author_id: 'user-1',
      topics: new Set(['comedy', 'sports']),
    });
  });
  it('should return null or undefined if a singleton subquery has no results', async () => {
    const query = db
      .query('users')
      .Select(['id'])
      .SubqueryOne(
        'favoritePost',
        db.query('posts').Where('author_id', '=', 'george')
      );
    const result = await db.fetch(query);
    expect(result.find((e) => e.id === 'user-1')).toHaveProperty(
      'favoritePost'
    );
    expect(result.find((e) => e.id === 'user-1')!.favoritePost).toEqual(null);
  });
});

describe('selecting subqueries from schema', () => {
  const db = new DB({
    schema: {
      roles: {
        user: {
          match: {
            USER_ID: '$userId',
          },
        },
      },
      collections: {
        users: {
          schema: S.Schema({
            id: S.String(),
            name: S.String(),
            friend_ids: S.Set(S.String(), { default: S.Default.Set.empty() }),
          }),
          relationships: {
            posts: S.RelationMany('posts', {
              where: [['author_id', '=', '$id']],
            }),
            friends: S.RelationMany('users', {
              where: [['id', 'in', '$friend_ids']],
            }),
            likes: S.RelationMany('likes', {
              where: [['user_id', '=', '$id']],
            }),
          },
        },
        posts: {
          schema: S.Schema({
            id: S.String(),
            content: S.String(),
            author_id: S.String(),
            topics: S.Set(S.String(), { default: S.Default.Set.empty() }),
          }),
          relationships: {
            author: S.RelationById('users', '$author_id'),
            likes: S.RelationMany('likes', {
              where: [['post_id', '=', '$id']],
            }),
          },
          // rules: {
          //   read: {
          //     'read your own posts': {
          //       filter: [['author_id', '=', '$session.USER_ID']],
          //     },
          //   },
          // },
          permissions: {
            user: {
              read: {
                filter: [['author_id', '=', '$role.userId']],
              },
              insert: {
                filter: [['author_id', '=', '$role.userId']],
              },
            },
          },
        },
        likes: {
          schema: S.Schema({
            id: S.Id(),
            user_id: S.String(),
            post_id: S.String(),
          }),
          relationships: {
            post: S.RelationById('posts', '$post_id'),
          },
        },
      },
    },
  });

  beforeAll(async () => {
    const users = [
      {
        id: 'user-1',
        name: 'Alice',
        friend_ids: new Set(['user-2', 'user-3']),
      },
      { id: 'user-2', name: 'Bob', friend_ids: new Set(['user-1', 'user-3']) },
      {
        id: 'user-3',
        name: 'Charlie',
        friend_ids: new Set(['user-1', 'user-2']),
      },
    ];

    const posts = [
      {
        id: 'post-1',
        content: 'Hello World!',
        author_id: 'user-1',
        topics: new Set(['comedy', 'sports']),
      },
      { id: 'post-2', content: 'Hello World!', author_id: 'user-2' },
      { id: 'post-3', content: 'Hello World!', author_id: 'user-3' },
    ];

    const likes = [
      { id: 'like-1', user_id: 'user-1', post_id: 'post-1' },
      { id: 'like-2', user_id: 'user-2', post_id: 'post-1' },
      { id: 'like-3', user_id: 'user-3', post_id: 'post-1' },
    ];

    for (const user of users) {
      await db.insert('users', user, { skipRules: true });
    }

    for (const post of posts) {
      await db.insert('posts', post, { skipRules: true });
    }

    for (const like of likes) {
      await db.insert('likes', like, { skipRules: true });
    }
  });

  const user1DB = db.withSessionVars({ USER_ID: 'user-1' });

  it('can select subqueries', async () => {
    const query = user1DB
      .query('users')
      .Include('posts')
      .Include('friends', {
        _extends: 'friends',
        where: [['name', 'like', '%e']],
      });
    const result = await user1DB.fetch(query);
    // Other fields are included in the selection
    expect(result.find((e) => e.id === 'user-1')).toHaveProperty('name');

    expect(result.find((e) => e.id === 'user-1')).toHaveProperty('posts');
    expect(result.find((e) => e.id === 'user-1')!.posts).toHaveLength(1);
    expect(
      result
        .find((e) => e.id === 'user-1')!
        .posts!.find((e) => e.id === 'post-1')
    ).toMatchObject({
      id: 'post-1',
      content: 'Hello World!',
      author_id: 'user-1',
      topics: new Set(['comedy', 'sports']),
    });
    expect(result.find((e) => e.id === 'user-1')!.friends).toHaveLength(1);
    expect(
      result
        .find((e) => e.id === 'user-1')!
        .friends.find((e) => e.id === 'user-3')
    ).toMatchObject({
      id: 'user-3',
      name: 'Charlie',
      friend_ids: new Set(['user-1', 'user-2']),
    });
  });

  it('can have multiple results have the same entity as a relation', async () => {
    const query = user1DB.query('likes').Include('post');
    const results = await user1DB.fetch(query);
    expect(results.length).toBe(3);
    const postsMap = new Map();
    for (const result of results.values()) {
      expect(result.post).not.toBeNull();
      if (postsMap.has(result.post.id)) {
        // TODO use the exact same object reference
        expect(postsMap.get(result.post.id)).toEqual(result.post);
      } else {
        postsMap.set(result.post.id, result.post);
      }
    }
  });

  it('must use include to select subqueries', async () => {
    const query = user1DB.query('users');

    const result = await user1DB.fetch(query);
    expect(result.find((e) => e.id === 'user-1')).not.toHaveProperty('posts');
    expect(result.find((e) => e.id === 'user-1')).not.toHaveProperty('friends');
  });

  it('can include subqueries in fetch by id', async () => {
    const result = await user1DB.fetchOne(
      user1DB.query('users').Id('user-1').Include('posts')
    );
    expect(result).toHaveProperty('posts');
    expect(result.posts).toHaveLength(1);
    expect(result.posts.find((e) => e.id === 'post-1')).toMatchObject({
      id: 'post-1',
      content: 'Hello World!',
      author_id: 'user-1',
      topics: new Set(['comedy', 'sports']),
    });
  });
  it('can select subsubqueries', async () => {
    const query = user1DB
      .query('users')
      .Include('posts', { _extends: 'posts', include: { likes: null } });
    const result = await user1DB.fetch(query);
    // Other fields are included in the selection
    expect(result.find((e) => e.id === 'user-1')).toHaveProperty('name');
    expect(result.find((e) => e.id === 'user-1')).toHaveProperty('posts');
    expect(result.find((e) => e.id === 'user-1')!.posts).toHaveLength(1);
    expect(
      result
        .find((e) => e.id === 'user-1')!
        .posts.find((e) => e.id === 'post-1')
    ).toBeDefined();
    // fails
    expect(
      result
        .find((e) => e.id === 'user-1')!
        .posts.find((e) => e.id === 'post-1')?.likes
    ).toBeDefined();
  });
  it('should throw an error if you try to update a subquery', async () => {
    await expect(
      async () =>
        await user1DB.update('users', 'user-1', async (entity) => {
          entity.likes = new Set(['like-1', 'like-2']);
        })
    ).rejects.toThrowError();
    await expect(
      async () =>
        await user1DB.update('users', 'user-1', async (entity) => {
          entity.posts = { hello: 'world' };
        })
    ).rejects.toThrowError();
  });

  it('correctly applies rules to subqueries', async () => {
    {
      const result = await user1DB.fetch(user1DB.query('posts'));
      expect(result).toHaveLength(1);
    }
    {
      const result = await user1DB.fetch(
        user1DB.query('users').Include('posts')
      );
      expect(result).toHaveLength(3);
      expect(result.find((e) => e.id === 'user-1')).toHaveProperty('posts');
      expect(result.find((e) => e.id === 'user-1')!.posts).toHaveLength(1);

      expect(result.find((e) => e.id === 'user-2')).toHaveProperty('posts');
      expect(result.find((e) => e.id === 'user-2')!.posts).toHaveLength(0);

      expect(result.find((e) => e.id === 'user-3')).toHaveProperty('posts');
      expect(result.find((e) => e.id === 'user-3')!.posts).toHaveLength(0);
    }
  });

  it('skipRules option should skip rules for subqueries', async () => {
    const userDb = db.withSessionVars({ USER_ID: 'irrelevant-user' });
    const query = userDb.query('users').Include('posts');
    {
      const results = await userDb.fetch(query, { skipRules: false });
      expect([...results.values()].map((user) => user.posts)).toMatchObject([
        new Map(),
        new Map(),
        new Map(),
      ]);
    }

    const results = await userDb.fetch(query, {
      skipRules: true,
    });
    expect(results).toHaveLength(3);
    expect(results.find((e) => e.id === 'user-1')).toHaveProperty('posts');
    expect(results.find((e) => e.id === 'user-1')!.posts).toHaveLength(1);
    expect(results.find((e) => e.id === 'user-2')).toHaveProperty('posts');
    expect(results.find((e) => e.id === 'user-2')!.posts).toHaveLength(1);
    expect(results.find((e) => e.id === 'user-3')).toHaveProperty('posts');
    expect(results.find((e) => e.id === 'user-3')!.posts).toHaveLength(1);
  });

  it('can select a singleton via a subquery', async () => {
    const query = user1DB.query('posts').Include('author');
    const result = await user1DB.fetch(query);
    expect(result.find((e) => e.id === 'post-1')).toHaveProperty('author');
    expect(result.find((e) => e.id === 'post-1').author).toMatchObject({
      id: 'user-1',
      name: 'Alice',
      friend_ids: new Set(['user-2', 'user-3']),
    });
  });

  it('will return null if a singleton subquery has no results', async () => {
    const query = user1DB.query('posts').Include('author', {
      _extends: 'author',
      where: [['id', '=', 'george']],
    });
    const result = await user1DB.fetch(query);
    expect(result.find((e) => e.id === 'post-1')).toHaveProperty('author');
    expect(result.find((e) => e.id === 'post-1').author).toEqual(null);
  });
  it('subscribe to subqueries when using id() in query', async () => {
    const query = user1DB.query('users').Id('user-1').Include('posts');
    await testSubscription(user1DB, query, [
      {
        check: (results) => {
          expect(results).toHaveLength(1);
          expect(results.find((e) => e.id === 'user-1')).toHaveProperty(
            'posts'
          );
          expect(results.find((e) => e.id === 'user-1')!.posts).toHaveLength(1);
        },
      },
      {
        action: async () => {
          await user1DB.insert('posts', {
            id: 'post-4',
            content: 'Hello World!',
            author_id: 'user-1',
          });
        },
        check: (results) => {
          expect(results).toHaveLength(1);
          expect(results.find((e) => e.id === 'user-1')).toHaveProperty(
            'posts'
          );
          expect(results.find((e) => e.id === 'user-1')!.posts).toHaveLength(2);
          expect(
            results
              .find((e) => e.id === 'user-1')!
              .posts.find((e) => e.id === 'post-4')
          ).toMatchObject({
            id: 'post-4',
            content: 'Hello World!',
            author_id: 'user-1',
          });
        },
      },
    ]);
  });
});

describe('relational querying / sub querying', () => {
  const db = new DB({});
  const DATA = [
    [
      'manufacturers',
      {
        name: 'Ford',
        country: 'USA',
        id: 'ford',
      },
    ],
    [
      'manufacturers',
      {
        name: 'Toyota',
        country: 'Japan',
        id: 'toyota',
      },
    ],
    [
      'manufacturers',
      {
        name: 'Honda',
        country: 'Japan',
        id: 'honda',
      },
    ],
    [
      'manufacturers',
      {
        name: 'Volkswagen',
        country: 'Germany',
        id: 'vw',
      },
    ],
    [
      'cars',
      { year: 2021, model: 'F150', manufacturer: 'ford', type: 'truck' },
    ],
    [
      'cars',
      { year: 2022, model: 'Fusion', manufacturer: 'ford', type: 'sedan' },
    ],
    [
      'cars',
      { year: 2022, model: 'Explorer', manufacturer: 'ford', type: 'SUV' },
    ],
    [
      'cars',
      { year: 2022, model: 'Camry', manufacturer: 'toyota', type: 'sedan' },
    ],
    [
      'cars',
      { year: 2021, model: 'Tacoma', manufacturer: 'toyota', type: 'truck' },
    ],
    [
      'cars',
      { year: 2021, model: 'Civic', manufacturer: 'honda', type: 'sedan' },
    ],
    [
      'cars',
      { year: 2022, model: 'Accord', manufacturer: 'honda', type: 'sedan' },
    ],
    ['cars', { year: 2022, model: 'Jetta', manufacturer: 'vw', type: 'sedan' }],
    ['cars', { year: 2023, model: 'Atlas', manufacturer: 'vw', type: 'truck' }],
    ['cars', { year: 2022, model: 'Tiguan', manufacturer: 'vw', type: 'SUV' }],
  ];
  beforeAll(async () => {
    // Insert mock data for Cars and Manufacturers
    // Manufacturer - Contains name and country
    for (const [collection, data] of DATA) {
      await db.insert(collection, data);
    }
  });

  it('can handle sub queries that use variables', async () => {
    const query = db.query('manufacturers').Where([
      {
        exists: db.query('cars').Where([
          ['type', '=', 'SUV'],
          ['manufacturer', '=', '$id'],
        ]),
      },
    ]);
    const result = await db.fetch(query);
    expect(result).toHaveLength(2);
    expect(new Set(result.map((e) => e.id))).toEqual(new Set(['ford', 'vw']));
  });

  it('can handle sub queries that use variables with deletes', async () => {
    const db = new DB({});
    for (const [collection, data] of DATA) {
      await db.insert(collection, data);
    }
    // Add matching data
    await db.insert('manufacturers', {
      name: 'Suburu',
      country: 'USA',
      id: 'suburu',
    });
    await db.insert('cars', {
      year: 2019,
      model: 'Outback',
      manufacturer: 'suburu',
      type: 'SUV',
    });
    // Delete a parent that would inject variables
    await db.delete('manufacturers', 'suburu');

    const query = db.query('manufacturers').Where([
      {
        exists: db.query('cars').Where([
          ['type', '=', 'SUV'],
          ['manufacturer', '=', '$id'],
        ]),
      },
    ]);
    const result = await db.fetch(query, { noCache: true });
    expect(result).toHaveLength(2);
  });

  it('can handle nested subqueries', async () => {
    const query = db.query('cars').Where([
      {
        exists: db.query('manufacturers').Where([
          ['id', '=', '$1.manufacturer'],
          {
            exists: db.query('cars').Where([
              ['type', '=', 'SUV'],
              ['manufacturer', '=', '$1.id'],
            ]),
          },
        ]),
      },
    ]);

    const result = await db.fetch(query);
    expect(result).toHaveLength(6);
  });

  it('can subscribe to queries with sub-queries', async () => {
    const query = db.query('manufacturers').Where([
      {
        exists: db.query('cars').Where([
          ['type', '=', 'SUV'],
          ['manufacturer', '=', '$id'],
        ]),
      },
    ]);
    await testSubscription(db, query, [
      {
        check: (results) => {
          expect(results).toHaveLength(2);
        },
      },
      {
        action: async () => {
          await db.transact(async (tx) => {
            await tx.insert('manufacturers', {
              name: 'Suburu',
              country: 'USA',
              id: 'suburu',
            });
            await tx.insert('cars', {
              year: 2019,
              model: 'Outback',
              manufacturer: 'suburu',
              type: 'SUV',
            });
          });
        },
        check: (results) => {
          expect(results).toHaveLength(3);
        },
      },
      {
        action: async () => {
          await db.insert('cars', {
            year: 2023,
            model: 'CRV',
            manufacturer: 'honda',
            type: 'SUV',
          });
        },
        check: (results) => {
          expect(results).toHaveLength(4);
        },
      },
    ]);
  });
});

describe('Subqueries in schema', () => {
  let db: DB;
  beforeEach(async () => {
    db = new DB({
      schema: {
        collections: {
          departments: {
            schema: S.Schema({
              id: S.String(),
              name: S.String(),
              num_faculty: S.Number(),
              dept_head_id: S.String(),
            }),
            relationships: {
              classes: S.RelationMany('classes', {
                where: [['department_id', '=', '$id']],
              }),
              dept_head: S.RelationById('faculty', '$dept_head_id'),
            },
          },
          classes: {
            schema: S.Schema({
              id: S.Id(),
              name: S.String(),
              level: S.Number(),
              building: S.String(),
              department_id: S.String(),
            }),
            relationships: {
              department: S.RelationById('departments', '$department_id'),
            },
          },
          faculty: {
            schema: S.Schema({
              id: S.Id(),
              name: S.String(),
            }),
          },
        },
      },
    });

    const faculty = [
      { id: '1', name: 'Dr. Smith' },
      { id: '2', name: 'Dr. Johnson' },
      { id: '3', name: 'Dr. Lee' },
      { id: '4', name: 'Dr. Brown' },
    ];
    const departments = [
      { name: 'CS', num_faculty: 5, dept_head_id: '1' },
      { name: 'Math', num_faculty: 10, dept_head_id: '2' },
      { name: 'English', num_faculty: 15, dept_head_id: '3' },
      { name: 'History', num_faculty: 10, dept_head_id: '4' },
    ];
    const classes = [
      {
        name: 'CS 101',
        level: 100,
        building: 'Warner',
        department_id: 'CS',
      },
      {
        name: 'CS 201',
        level: 200,
        building: 'Warner',
        department_id: 'CS',
      },
      {
        name: 'CS 301',
        level: 300,
        building: 'Warner',
        department_id: 'CS',
      },
      {
        name: 'Math 101',
        level: 100,
        building: 'BiHall',
        department_id: 'Math',
      },
      {
        name: 'Math 201',
        level: 200,
        building: 'BiHall',
        department_id: 'Math',
      },
      {
        name: 'Math 301',
        level: 300,
        building: 'BiHall',
        department_id: 'Math',
      },
      {
        name: 'English 101',
        level: 100,
        building: 'Twilight',
        department_id: 'English',
      },
      {
        name: 'English 201',
        level: 200,
        building: 'Twilight',
        department_id: 'English',
      },
      {
        name: 'English 301',
        level: 300,
        building: 'Twilight',
        department_id: 'English',
      },
      {
        name: 'History 101',
        level: 100,
        building: 'Voter',
        department_id: 'History',
      },
      {
        name: 'History 201',
        level: 200,
        building: 'Voter',
        department_id: 'History',
      },
      {
        name: 'History 301',
        level: 300,
        building: 'Voter',
        department_id: 'History',
      },
    ];
    for (const f of faculty) {
      await db.insert('faculty', f);
    }
    for (const department of departments) {
      await db.insert('departments', { id: department.name, ...department });
    }
    for (const cls of classes) {
      await db.insert('classes', cls);
    }
  });

  it('can query a subquery in a schema', async () => {
    // test finding all departments in a Voter
    const results = await db.fetch(
      db.query('departments').Where([['classes.building', '=', 'Voter']])
    );

    expect(results).toHaveLength(1);
  });

  it('can query a subquery in a transaction', async () => {
    // test finding all departments in a Voter
    await db.transact(async (tx) => {
      const results = await tx.fetch(
        db.query('departments').Where([['classes.building', '=', 'Voter']])
      );

      expect(results).toHaveLength(1);
    });
  });

  it('can query a subquery with a set attribute', async () => {
    // find classes in the CS department
    const results = await db.fetch(
      db.query('classes').Where([['department.name', '=', 'CS']])
    );

    expect(results).toHaveLength(3);
  });

  it('can query a subquery within a subscription', async () => {
    // find classes in the CS department
    const query = db.query('classes').Where([['department.name', '=', 'CS']]);
    await testSubscription(db, query, [
      {
        check: (results) => {
          expect(results).toHaveLength(3);
        },
      },
      {
        action: async () => {
          await db.insert('classes', {
            id: 'CS 401',
            name: 'CS 401',
            level: 400,
            building: 'Warner',
            department_id: 'CS',
          });
        },
        check: (results) => {
          expect(results).toHaveLength(4);
        },
      },
    ]);
  });

  it('can order query by a relation', async () => {
    const query = db
      .query('classes')
      .Order(['department.name', 'DESC'], ['name', 'ASC']);
    const results = await db.fetch(query);
    const classNames = Array.from(results.values()).map(
      (result) => result.name
    );
    expect(classNames).toEqual([
      'Math 101',
      'Math 201',
      'Math 301',
      'History 101',
      'History 201',
      'History 301',
      'English 101',
      'English 201',
      'English 301',
      'CS 101',
      'CS 201',
      'CS 301',
    ]);
  });

  it('can order query by a relation - multiple related clauses', async () => {
    const query = db
      .query('classes')
      .Order(
        ['department.num_faculty', 'ASC'],
        ['department.name', 'DESC'],
        ['name', 'ASC']
      );
    const results = await db.fetch(query);
    const classNames = Array.from(results.values()).map(
      (result) => result.name
    );
    expect(classNames).toEqual([
      'CS 101',
      'CS 201',
      'CS 301',
      'Math 101',
      'Math 201',
      'Math 301',
      'History 101',
      'History 201',
      'History 301',
      'English 101',
      'English 201',
      'English 301',
    ]);
  });

  it('can order by deep relation', async () => {
    const query = db
      .query('classes')
      .Order(['department.dept_head.name', 'ASC'], ['name', 'ASC']);
    const results = await db.fetch(query);
    const classNames = Array.from(results.values()).map(
      (result) => result.name
    );
    expect(classNames).toEqual([
      'History 101',
      'History 201',
      'History 301',
      'Math 101',
      'Math 201',
      'Math 301',
      'English 101',
      'English 201',
      'English 301',
      'CS 101',
      'CS 201',
      'CS 301',
    ]);
  });

  it('order by cardinality many will throw error', async () => {
    const query = db.query('departments').Order(['classes.name', 'ASC']);
    await expect(db.fetch(query)).rejects.toThrow(InvalidOrderClauseError);
  });

  it('order by non leaf will throw error', async () => {
    const query = db.query('classes').Order(['department', 'ASC']);
    await expect(db.fetch(query)).rejects.toThrow(InvalidOrderClauseError);
  });

  it('order by relation with subscription', async () => {
    const query = db
      .query('classes')
      .Order(['department.name', 'ASC'], ['name', 'ASC']);

    await testSubscription(db, query, [
      {
        check: (results) => {
          const classNames = Array.from(results.values()).map(
            (result) => result.name
          );
          expect(classNames).toEqual([
            'CS 101',
            'CS 201',
            'CS 301',
            'English 101',
            'English 201',
            'English 301',
            'History 101',
            'History 201',
            'History 301',
            'Math 101',
            'Math 201',
            'Math 301',
          ]);
        },
      },
      {
        action: async () => {
          await db.insert('classes', {
            id: 'CS 401',
            name: 'CS 401',
            level: 400,
            building: 'Warner',
            department_id: 'CS',
          });
        },
        check: (results) => {
          const classNames = Array.from(results.values()).map(
            (result) => result.name
          );
          expect(classNames).toEqual([
            'CS 101',
            'CS 201',
            'CS 301',
            'CS 401',
            'English 101',
            'English 201',
            'English 301',
            'History 101',
            'History 201',
            'History 301',
            'Math 101',
            'Math 201',
            'Math 301',
          ]);
        },
      },
    ]);
  });
});

describe('social network test', () => {
  let db: DB;
  beforeAll(async () => {
    db = new DB({
      schema: {
        collections: {
          users: {
            schema: S.Schema({
              id: S.String(),
              name: S.String(),
              friend_ids: S.Set(S.String(), { default: S.Default.Set.empty() }),
            }),
            relationships: {
              friends: S.RelationMany('users', {
                where: [['id', 'in', '$friend_ids']],
              }),
              posts: S.RelationMany('posts', {
                where: [['author_id', '=', '$id']],
              }),
            },
          },
          posts: {
            schema: S.Schema({
              id: S.String(),
              content: S.String(),
              author_id: S.String(),
            }),
            relationships: { author: S.RelationById('users', '$author_id') },
          },
        },
      },
    });
    // insert sample data
    await db.insert('users', {
      id: 'user-1',
      name: 'Alice',
      friend_ids: new Set(['user-2', 'user-3']),
    });
    await db.insert('users', {
      id: 'user-2',
      name: 'Bob',
      friend_ids: new Set(['user-1', 'user-3']),
    });
    await db.insert('users', {
      id: 'user-3',
      name: 'Charlie',
      friend_ids: new Set(['user-1', 'user-2']),
    });
    await db.insert('posts', {
      id: 'post-1',
      content: 'Hello World!',
      author_id: 'user-1',
    });
    await db.insert('posts', {
      id: 'post-2',
      content: 'Hello World!',
      author_id: 'user-2',
    });
    await db.insert('posts', {
      id: 'post-3',
      content: 'Hello World!',
      author_id: 'user-3',
    });
  });

  it('can query posts from friends', async () => {
    const userDb = db.withSessionVars({ USER_ID: 'user-1' });
    const query = userDb
      .query('posts')
      .Where([['author.friend_ids', '=', '$session.USER_ID']]);
    const results = await userDb.fetch(query);
    expect(results).toHaveLength(2);
  });
});

/**
 * This test is to ensure that the query engine can properly re-use entities and assign them different relations as needed
 *
 * for example:
 * - branch-1 -> benchmark-1 -> run-1
 * - branch-2 -> benchmark-1 -> run-2
 *
 * Both load benchmark-1, but those benchmark-1 entities should be different objects
 */
it('assigns relations properly with shared nesting paths', async () => {
  const schema = S.Collections({
    branches: {
      schema: S.Schema({
        id: S.Id(),
      }),
      relationships: {
        runs: S.RelationMany('runs', { where: [['branch_name', '=', '$id']] }),
        latest_run: S.RelationOne('runs', {
          where: [['branch_name', '=', '$id']],
          order: [['created_at', 'DESC']],
        }),
      },
    },
    runs: {
      schema: S.Schema({
        id: S.Id(),
        created_at: S.Date({ default: S.Default.now() }),
        benchmark: S.String(),
        branch_name: S.String(),
        commit_hash: S.String(),
        commit_message: S.String(),
        results: S.Record({
          memory_avg: S.Number(),
          memory_max: S.Number(),
          runtime_avg: S.Number(),
          runtime_max: S.Number(),
          run_metadata: S.Optional(S.String()),
        }),
      }),
      relationships: {
        branch: S.RelationById('branches', '$branch_name'),
      },
    },
    benchmarks: {
      schema: S.Schema({
        id: S.Id(),
        name: S.String(),
        description: S.Optional(S.String()),
        created_at: S.Date({ default: S.Default.now() }),
      }),
      relationships: {
        runs: S.RelationMany('runs', { where: [['benchmark', '=', '$id']] }),
        latest_run: S.RelationOne('runs', {
          where: [['benchmark', '=', '$id']],
          order: [['created_at', 'DESC']],
        }),
      },
    },
  });

  const db = new DB({
    schema: { collections: schema },
  });

  const BRANCHES = [
    // Multiple runs on some benchmarks
    { id: 'master' },
    // Multiple runs on some benchamrks
    { id: 'dev' },
    // No runs
    { id: 'feature-1' },
  ];
  const BENCHMARKS = [
    { id: 'benchmark-1', name: 'benchmark-1' },
    { id: 'benchmark-2', name: 'benchmark-2' },
    { id: 'benchmark-3', name: 'benchmark-3' },
  ];
  const RUNS = [
    {
      id: 'run-1',
      benchmark: 'benchmark-1',
      branch_name: 'master',
      commit_hash: 'hash-1',
      commit_message: 'commit message 1',
      created_at: new Date('2023-01-01'),
      results: {
        memory_avg: 100,
        memory_max: 200,
        runtime_avg: 10,
        runtime_max: 20,
      },
    },
    {
      id: 'run-2',
      benchmark: 'benchmark-1',
      branch_name: 'dev',
      commit_hash: 'hash-2',
      commit_message: 'commit message 2',
      created_at: new Date('2023-01-02'),
      results: {
        memory_avg: 100,
        memory_max: 200,
        runtime_avg: 10,
        runtime_max: 20,
      },
    },
    {
      id: 'run-3',
      benchmark: 'benchmark-2',
      branch_name: 'master',
      commit_hash: 'hash-3',
      commit_message: 'commit message 3',
      created_at: new Date('2023-01-02'),
      results: {
        memory_avg: 100,
        memory_max: 200,
        runtime_avg: 10,
        runtime_max: 20,
      },
    },
    {
      id: 'run-4',
      benchmark: 'benchmark-2',
      branch_name: 'dev',
      commit_hash: 'hash-4',
      commit_message: 'commit message 4',
      created_at: new Date('2023-01-03'),
      results: {
        memory_avg: 100,
        memory_max: 200,
        runtime_avg: 10,
        runtime_max: 20,
      },
    },
  ];

  await db.transact(async (tx) => {
    for (const branch of BRANCHES) {
      await tx.insert('branches', branch);
    }
    for (const benchmark of BENCHMARKS) {
      await tx.insert('benchmarks', benchmark);
    }
    for (const run of RUNS) {
      await tx.insert('runs', run);
    }
  });

  const query = db
    .query('branches')
    .SubqueryOne('latest_run', {
      collectionName: 'runs',
      select: ['id'],
      order: [['created_at', 'DESC']],
      where: [['branch_name', '=', '$1.id']],
    })
    .SubqueryMany('benchmarks', {
      collectionName: 'benchmarks',
      select: ['id', 'name'],
      include: {
        latest_branch_run: {
          subquery: {
            collectionName: 'runs',
            select: ['id'],
            order: [['created_at', 'DESC']],
            where: [
              ['benchmark', '=', '$1.id'],
              ['branch_name', '=', '$2.id'],
            ],
          },
          cardinality: 'one',
        },
      },
    });
  const results = await db.fetch(query);
  expect(results).toEqual([
    {
      id: 'dev',
      latest_run: { id: 'run-4' },
      benchmarks: [
        {
          id: 'benchmark-1',
          name: 'benchmark-1',
          latest_branch_run: { id: 'run-2' },
        },
        {
          id: 'benchmark-2',
          name: 'benchmark-2',
          latest_branch_run: { id: 'run-4' },
        },
        { id: 'benchmark-3', name: 'benchmark-3', latest_branch_run: null },
      ],
    },
    {
      id: 'feature-1',
      latest_run: null,
      benchmarks: [
        {
          id: 'benchmark-1',
          name: 'benchmark-1',
          latest_branch_run: null,
        },
        {
          id: 'benchmark-2',
          name: 'benchmark-2',
          latest_branch_run: null,
        },
        { id: 'benchmark-3', name: 'benchmark-3', latest_branch_run: null },
      ],
    },
    {
      id: 'master',
      latest_run: { id: 'run-3' },
      benchmarks: [
        {
          id: 'benchmark-1',
          name: 'benchmark-1',
          latest_branch_run: { id: 'run-1' },
        },
        {
          id: 'benchmark-2',
          name: 'benchmark-2',
          latest_branch_run: { id: 'run-3' },
        },
        { id: 'benchmark-3', name: 'benchmark-3', latest_branch_run: null },
      ],
    },
  ]);
});

it('Can load a relation with variable nested in a record', async () => {
  const schema = S.Collections({
    a: {
      schema: S.Schema({
        id: S.Id(),
        record: S.Record({
          bId: S.String(),
        }),
      }),
      relationships: {
        // Test no scope
        b1: S.RelationById('b', '$record.bId'),
        // Test with scope
        b2: S.RelationById('b', '$1.record.bId'),
      },
    },
    b: {
      schema: S.Schema({
        id: S.Id(),
      }),
    },
  });
  const db = new DB({ schema: { collections: schema } });
  await db.insert('b', { id: 'b-1' });
  await db.insert('a', { id: 'a-1', record: { bId: 'b-1' } });

  const result = await db.fetchOne(db.query('a').Include('b1').Include('b2'));
  expect(result).toEqual({
    id: 'a-1',
    record: { bId: 'b-1' },
    b1: { id: 'b-1' },
    b2: { id: 'b-1' },
  });
});

const messagingSchema = S.Collections({
  users: {
    schema: S.Schema({
      id: S.Id(),
      name: S.String(),
    }),
  },
  groups: {
    schema: S.Schema({
      id: S.Id(),
      name: S.String(),
      member_ids: S.Set(S.String()),
      creator_id: S.String(),
    }),
  },
});

function seedMessagingDB(db: DB<typeof messagingSchema>) {
  return db.transact(async (tx) => {
    await tx.insert('users', { id: 'user-1', name: 'Alice' });
    await tx.insert('users', { id: 'user-2', name: 'Bob' });
    await tx.insert('users', { id: 'user-3', name: 'Charlie' });

    await tx.insert('groups', {
      id: 'group-1',
      name: 'Group 1',
      member_ids: new Set(['user-1', 'user-2']),
      creator_id: 'user-1',
    });
    await tx.insert('groups', {
      id: 'group-2',
      name: 'Group 2',
      member_ids: new Set(['user-1', 'user-3']),
      creator_id: 'user-3',
    });
  });
}

// group.memebrs user: [id, in, $1.members]
// group.memebrs creator: [id, in, members] && [creator, =, $1.id]

const TestScoreSchema = S.Collections({
  students: {
    schema: S.Schema({
      id: S.Id(),
      name: S.String(),
    }),
  },
  scores: {
    schema: S.Schema({
      id: S.Id(),
      student_id: S.String(),
      score: S.Number(),
    }),
    relationships: {
      student: S.RelationById('students', '$student_id'),
    },
  },
});
function seedTestScoreDB(db: DB<typeof TestScoreSchema>) {
  return db.transact(async (tx) => {
    await tx.insert('students', { id: 'student-1', name: 'Alice' });
    await tx.insert('students', { id: 'student-2', name: 'Bob' });
    const aliceScores = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10];
    const bobScores = [95, 85, 75, 65, 55, 45, 35, 25, 15, 5];
    for (let i = 0; i < aliceScores.length; i++) {
      await tx.insert('scores', {
        id: `score-${i + 1}`,
        student_id: 'student-1',
        score: aliceScores[i],
      });
      await tx.insert('scores', {
        id: `score-${i + 11}`,
        student_id: 'student-2',
        score: bobScores[i],
      });
    }
  });
}

// These essentially attempt to test the VAC and other relational paths that are lightly tested
// I dont know the best place to put this, im tempted to directly test the VAC or query engine
describe('Variable filters', () => {
  describe('operators', () => {
    it('can join by "in" operator', async () => {
      const db = new DB({ schema: { collections: messagingSchema } });
      await seedMessagingDB(db);
      // Single filter
      {
        const query = db
          .query('groups')
          .SubqueryMany('members', {
            collectionName: 'users',
            where: [['id', 'in', '$1.member_ids']],
          })
          .Where([['id', '=', 'group-1']]);
        const result = await db.fetchOne(query);
        expect(result).toEqual({
          id: 'group-1',
          name: 'Group 1',
          member_ids: new Set(['user-1', 'user-2']),
          creator_id: 'user-1',
          members: [
            { id: 'user-1', name: 'Alice' },
            { id: 'user-2', name: 'Bob' },
          ],
        });
      }
      // Multiple filters
      {
        const query = db
          .query('groups')
          .SubqueryOne('creator', {
            collectionName: 'users',
            where: [
              ['id', '=', '$1.creator_id'],
              ['id', 'in', '$1.member_ids'],
            ],
          })
          .Where([['id', '=', 'group-1']]);
        const result = await db.fetchOne(query);
        expect(result).toEqual({
          id: 'group-1',
          name: 'Group 1',
          member_ids: new Set(['user-1', 'user-2']),
          creator_id: 'user-1',
          creator: { id: 'user-1', name: 'Alice' },
        });
      }
    });
    it('can join by "has"', async () => {
      const db = new DB({ schema: { collections: messagingSchema } });
      await seedMessagingDB(db);
      {
        const query = db
          .query('users')
          .SubqueryMany('groups', {
            collectionName: 'groups',
            where: [['member_ids', 'has', '$1.id']],
          })
          .Where([['id', '=', 'user-1']]);
        const result = await db.fetchOne(query);
        expect(result).toEqual({
          id: 'user-1',
          name: 'Alice',
          groups: [
            {
              id: 'group-1',
              name: 'Group 1',
              member_ids: new Set(['user-1', 'user-2']),
              creator_id: 'user-1',
            },
            {
              id: 'group-2',
              name: 'Group 2',
              member_ids: new Set(['user-1', 'user-3']),
              creator_id: 'user-3',
            },
          ],
        });
      }

      {
        const query = db
          .query('users')
          .SubqueryMany('created_groups', {
            collectionName: 'groups',
            where: [
              ['creator_id', '=', '$1.id'],
              ['member_ids', 'has', '$1.id'],
            ],
          })
          .Where([['id', '=', 'user-1']]);
        const result = await db.fetchOne(query);
        expect(result).toEqual({
          id: 'user-1',
          name: 'Alice',
          created_groups: [
            {
              id: 'group-1',
              name: 'Group 1',
              member_ids: new Set(['user-1', 'user-2']),
              creator_id: 'user-1',
            },
          ],
        });
      }
    });
    it('can join with set = operator', async () => {
      const db = new DB({ schema: { collections: messagingSchema } });
      await seedMessagingDB(db);
      {
        const query = db
          .query('users')
          .SubqueryMany('groups', {
            collectionName: 'groups',
            where: [['member_ids', '=', '$1.id']],
          })
          .Where([['id', '=', 'user-1']]);
        const result = await db.fetchOne(query);
        expect(result).toEqual({
          id: 'user-1',
          name: 'Alice',
          groups: [
            {
              id: 'group-1',
              name: 'Group 1',
              member_ids: new Set(['user-1', 'user-2']),
              creator_id: 'user-1',
            },
            {
              id: 'group-2',
              name: 'Group 2',
              member_ids: new Set(['user-1', 'user-3']),
              creator_id: 'user-3',
            },
          ],
        });
      }
    });
  });
});
