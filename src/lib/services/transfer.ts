const APPLE_DEVELOPER_TOKEN =
  'eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjZLVkRTNjc2NVMifQ.eyJpYXQiOjE3MzE0NTQ2OTEsImV4cCI6MTc0NzAwNjY5MSwiaXNzIjoiRFlXNEFHOTQ0MiJ9.Us6UP86UTEZJtCdyVLlOGGj-hw_pZ4lu4Pk-htEbolgWrph6P_toc9INvLhzVgVlD5ToyiD_m8CssZlPunUGHw';

interface TransferPlaylistParams {
  sourceService: 'spotify' | 'apple-music';
  targetService: 'spotify' | 'apple-music';
  playlist: any;
  sourceToken: string;
  targetToken: string;
}

interface Track {
  name: string;
  artist: string;
  album: string;
  isrc?: string;
}

interface TransferProgress {
  stage: 'fetching' | 'creating' | 'searching' | 'adding';
  current?: number;
  total?: number;
  message: string;
}

interface TransferPlaylistParams {
  sourceService: 'spotify' | 'apple-music';
  targetService: 'spotify' | 'apple-music';
  playlist: any;
  sourceToken: string;
  targetToken: string;
  onProgress?: (progress: TransferProgress) => void;
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryWithBackoff(
  fn: () => Promise<any>,
  retries = 3,
  baseDelay = 1000
) {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await fn();
      return result || { success: true }; // Return a default object if no response
    } catch (error: any) {
      if (
        error?.message?.includes('API capacity exceeded') &&
        i < retries - 1
      ) {
        const delayTime = baseDelay * Math.pow(2, i);
        console.log(`Rate limited. Retrying in ${delayTime}ms...`);
        await delay(delayTime);
        continue;
      }
      throw error;
    }
  }
}

async function createPlaylist(
  service: 'spotify' | 'apple-music',
  { name, description }: { name: string; description: string },
  token: string
) {
  console.log(`Creating playlist in ${service}:`, { name, description });

  if (service === 'spotify') {
    const response = await fetch('https://api.spotify.com/v1/me/playlists', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        description,
        public: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to create Spotify playlist:', errorText);
      throw new Error('Failed to create Spotify playlist');
    }

    const data = await response.json();
    console.log('Successfully created Spotify playlist:', data);
    return {
      id: data.id,
      name: data.name,
    };
  } else {
    const response = await fetch(
      'https://api.music.apple.com/v1/me/library/playlists',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${APPLE_DEVELOPER_TOKEN}`,
          'Music-User-Token': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          attributes: {
            name,
            description,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to create Apple Music playlist:', errorText);
      throw new Error('Failed to create Apple Music playlist');
    }

    const data = await response.json();
    console.log('Successfully created Apple Music playlist:', data);
    return {
      id: data.data[0].id,
      name: data.data[0].attributes.name,
    };
  }
}

export async function transferPlaylist({
  sourceService,
  targetService,
  playlist,
  sourceToken,
  targetToken,
  onProgress,
}: TransferPlaylistParams) {
  // 1. Get tracks from source playlist
  onProgress?.({
    stage: 'fetching',
    message: 'Fetching tracks from source playlist...',
  });
  const tracks = await getPlaylistTracks(
    sourceService,
    playlist.id,
    sourceToken
  );

  // 2. Create new playlist
  onProgress?.({
    stage: 'creating',
    message: 'Creating new playlist in target service...',
  });
  const newPlaylist = await createPlaylist(
    targetService,
    {
      name: playlist.name || playlist.attributes?.name,
      description: `Transferred from ${sourceService} using Velvet Metal`,
    },
    targetToken
  );

  // 3. Search and add tracks
  onProgress?.({
    stage: 'searching',
    current: 0,
    total: tracks.length,
    message: `Searching for tracks in ${targetService}...`,
  });

  await addTracksToPlaylist(
    targetService,
    newPlaylist.id,
    tracks,
    targetToken,
    (current) =>
      onProgress?.({
        stage: 'searching',
        current,
        total: tracks.length,
        message: `Found ${current}/${tracks.length} tracks...`,
      })
  );

  onProgress?.({
    stage: 'adding',
    message: 'Adding tracks to playlist...',
  });

  return newPlaylist;
}

async function getPlaylistTracks(
  service: 'spotify' | 'apple-music',
  playlistId: string,
  token: string
): Promise<Track[]> {
  console.log(`Fetching tracks from ${service} playlist ${playlistId}`);

  if (service === 'spotify') {
    const response = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to fetch Spotify tracks:', errorText);
      throw new Error('Failed to fetch Spotify tracks');
    }

    const data = await response.json();
    console.log(`Found ${data.items.length} tracks in Spotify playlist`);

    return data.items.map((item: any) => {
      const track = {
        name: item.track.name,
        artist: item.track.artists[0].name,
        album: item.track.album.name,
        isrc: item.track.external_ids?.isrc,
      };
      console.log('Processed Spotify track:', track);
      return track;
    });
  } else {
    const response = await fetch(
      `https://api.music.apple.com/v1/me/library/playlists/${playlistId}/tracks`,
      {
        headers: {
          Authorization: `Bearer ${APPLE_DEVELOPER_TOKEN}`,
          'Music-User-Token': token,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to fetch Apple Music tracks:', errorText);
      throw new Error('Failed to fetch Apple Music tracks');
    }

    const data = await response.json();
    console.log(`Found ${data.data.length} tracks in Apple Music playlist`);

    return data.data.map((item: any) => {
      const track = {
        name: item.attributes.name,
        artist: item.attributes.artistName,
        album: item.attributes.albumName,
        isrc: item.attributes.isrc,
      };
      console.log('Processed Apple Music track:', track);
      return track;
    });
  }
}

async function addTracksToPlaylist(
  service: 'spotify' | 'apple-music',
  playlistId: string,
  tracks: Track[],
  token: string,
  onProgress?: (current: number) => void
) {
  console.log(
    `Starting to add ${tracks.length} tracks to ${service} playlist ${playlistId}`
  );

  if (service === 'spotify') {
    // First search for each track
    console.log('Searching for tracks on Spotify...');
    const trackUris = await Promise.all(
      tracks.map(async (track, index) => {
        console.log(`[${index + 1}/${tracks.length}] Searching for track:`, {
          name: track.name,
          artist: track.artist,
          isrc: track.isrc,
        });

        const query = track.isrc
          ? `isrc:${track.isrc}`
          : `track:${track.name} artist:${track.artist}`;

        console.log('Search query:', query);

        const response = await fetch(
          `https://api.spotify.com/v1/search?q=${encodeURIComponent(
            query
          )}&type=track&limit=1`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Failed to search Spotify track:', errorText);
          return null;
        }

        const data = await response.json();
        const uri = data.tracks.items[0]?.uri;
        if (uri) {
          console.log(`✓ Found track: ${uri}`);
        } else {
          console.warn(
            `✗ No match found for: ${track.name} by ${track.artist}`
          );
        }
        return uri;
      })
    );

    const validTrackUris = trackUris.filter(Boolean);
    console.log(
      `Found ${validTrackUris.length}/${tracks.length} tracks on Spotify`
    );

    if (validTrackUris.length === 0) {
      console.warn('No tracks were found to add to the playlist');
      return;
    }

    // Add tracks to playlist
    console.log('Adding tracks to Spotify playlist...');
    const response = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          uris: validTrackUris,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to add tracks to playlist:', errorText);
      throw new Error('Failed to add tracks to Spotify playlist');
    }

    console.log('Successfully added tracks to Spotify playlist');
    return response.json();
  } else {
    // First search for each track
    console.log('Searching for tracks on Apple Music...');
    const trackIds = await Promise.all(
      tracks.map(async (track, index) => {
        await delay(1000); // Add delay between requests
        return retryWithBackoff(async () => {
          console.log(`[${index + 1}/${tracks.length}] Searching for track:`, {
            name: track.name,
            artist: track.artist,
            isrc: track.isrc,
          });

          const query = encodeURIComponent(`${track.name} ${track.artist}`);
          const response = await fetch(
            `https://api.music.apple.com/v1/catalog/us/search?term=${query}&types=songs&limit=1`,
            {
              headers: {
                Authorization: `Bearer ${APPLE_DEVELOPER_TOKEN}`,
                'Music-User-Token': token,
              },
            }
          );

          if (!response.ok) {
            const errorText = await response.text();
            console.error('Failed to search Apple Music track:', errorText);
            throw new Error(errorText);
          }

          const data = await response.json();
          const songId = data.results?.songs?.data?.[0]?.id;

          if (songId) {
            console.log(`✓ Found track: ${songId}`);
          } else {
            console.warn(
              `✗ No match found for: ${track.name} by ${track.artist}`
            );
          }
          return songId;
        });
      })
    );

    const validTrackIds = trackIds.filter(Boolean);
    console.log(
      `Found ${validTrackIds.length}/${tracks.length} tracks on Apple Music`
    );

    if (validTrackIds.length === 0) {
      console.warn('No tracks were found to add to the playlist');
      return;
    }

    // Add tracks to playlist with retry
    console.log('Adding tracks to Apple Music playlist...');
    return retryWithBackoff(async () => {
      const response = await fetch(
        `https://api.music.apple.com/v1/me/library/playlists/${playlistId}/tracks`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${APPLE_DEVELOPER_TOKEN}`,
            'Music-User-Token': token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            data: validTrackIds.map((id) => ({
              id,
              type: 'songs',
            })),
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          'Failed to add tracks to Apple Music playlist:',
          errorText
        );
        throw new Error('Failed to add tracks to Apple Music playlist');
      }

      console.log('Successfully added tracks to Apple Music playlist');
      return { success: true };
    });
  }
}
