import { describe, expect, it, beforeAll } from 'vitest';
import { DB, Schema as S } from '../../src';

describe('Music app queries', () => {
  let db: DB<any>;
  beforeAll(async () => {
    db = new DB({
      schema: {
        collections: {
          artists: {
            schema: S.Schema({
              id: S.String(),
              name: S.String(),
              tracks: S.Query({
                collectionName: 'tracks',
                where: [['artist_id', '=', '$id']],
              }),
              albums: S.Query({
                collectionName: 'albums',
                where: [['artist_id', '=', '$id']],
              }),
            }),
          },
          tracks: {
            schema: S.Schema({
              id: S.String(),
              title: S.String(),
              artist_id: S.String(),
              album_id: S.String(),
              artist: S.Query({
                collectionName: 'artists',
                where: [['id', '=', '$artist_id']],
              }),
              album: S.Query({
                collectionName: 'albums',
                where: [['id', '=', '$album_id']],
              }),
            }),
          },
          albums: {
            schema: S.Schema({
              id: S.String(),
              title: S.String(),
              artist_id: S.String(),
              artist: S.Query({
                collectionName: 'artists',
                where: [['id', '=', '$artist_id']],
              }),
              tracks: S.Query({
                collectionName: 'tracks',
                where: [['album_id', '=', '$id']],
              }),
            }),
          },
          playlists: {
            schema: S.Schema({
              id: S.String(),
              name: S.String(),
              track_ids: S.Set(S.String()),
              tracks: S.Query({
                collectionName: 'tracks',
                where: [['id', 'in', '$track_ids']],
              }),
            }),
          },
        },
      },
    });

    // Seed data for Artists, Tracks, Albums, Playlists would go here
    // Artists
    const artist1 = { id: 'artist1', name: 'The Rolling Stones' };
    const artist2 = { id: 'artist2', name: 'The Beatles' };
    await db.insert('artists', artist1, artist1.id);
    await db.insert('artists', artist2, artist2.id);

    // Albums
    const album1 = {
      id: 'album1',
      title: 'Sticky Fingers',
      artist_id: 'artist1',
    };
    const album2 = { id: 'album2', title: 'Abbey Road', artist_id: 'artist2' };
    await db.insert('albums', album1, album1.id);
    await db.insert('albums', album2, album2.id);

    // Tracks for Rolling Stones
    const track1 = {
      id: 'track0',
      title: 'Brown Sugar',
      artist_id: 'artist1',
      album_id: 'album1',
    };
    const track2 = {
      id: 'track1',
      title: 'Wild Horses',
      artist_id: 'artist1',
      album_id: 'album1',
    };
    await db.insert('tracks', track1, track1.id);
    await db.insert('tracks', track2, track2.id);

    // Tracks for The Beatles
    const track3 = {
      id: 'track2',
      title: 'Come Together',
      artist_id: 'artist2',
      album_id: 'album2',
    };
    const track4 = {
      id: 'track3',
      title: 'Something',
      artist_id: 'artist2',
      album_id: 'album2',
    };
    await db.insert('tracks', track3, track3.id);
    await db.insert('tracks', track4, track4.id);

    // Playlists
    const playlist1 = {
      id: 'playlist1',
      name: 'Best of Rock',
      track_ids: ['track1', 'track3'],
    };
    await db.insert('playlists', playlist1, playlist1.id);
  });

  it('can search tracks for a given artist name pattern', async () => {
    const results = await db.fetch(
      db
        .query('tracks')
        .where([['artist.name', 'like', 'The%']])
        .build()
    );

    expect(results).toHaveLength(4);
  });

  it('can query tracks for a given artist', async () => {
    const artistName = 'The Rolling Stones';
    const results = await db.fetch(
      db
        .query('tracks')
        .where([['artist.name', '=', artistName]])
        .build()
    );

    expect(results).not.toHaveLength(0);
  });

  it('can query albums for a given artist', async () => {
    const artistName = 'The Beatles';
    const results = await db.fetch(
      db
        .query('albums')
        .where([['artist.name', '=', artistName]])
        .build()
    );

    expect(results).not.toHaveLength(0);
  });

  it('can query the artist of a given track', async () => {
    const trackTitle = 'Come Together';
    const results = await db.fetch(
      db
        .query('artists')
        .where([['tracks.title', '=', trackTitle]])
        .build()
    );

    expect(results).toHaveLength(1);
    expect([...results.values()][0].name).toBe('The Beatles');
  });

  it('can query tracks for a given album', async () => {
    const albumTitle = 'Sticky Fingers';
    const results = await db.fetch(
      db
        .query('tracks')
        .where([['album.title', '=', albumTitle]])
        .build()
    );

    expect(results).not.toHaveLength(0);
  });

  it('fetch playlists and then tracks for a given playlist', async () => {
    const playlistName = 'Best of Rock';
    const playlistResults = await db.fetch(
      db
        .query('playlists')
        .where([['name', '=', playlistName]])
        .build()
    );

    expect(playlistResults).toHaveLength(1);
    const playlist = [...playlistResults.values()][0];
    expect(playlist.name).toBe(playlistName);

    const trackResults = await db.fetch(
      db
        .query('tracks')
        .where(['id', 'in', Array.from(playlist.track_ids)])
        .build()
    );

    expect(trackResults).toHaveLength(2);
  });
});
