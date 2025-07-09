// 定数
const SPOTIFY_CLIENT_ID = ''; // 開発用のClient ID
const SPOTIFY_REDIRECT_URI = chrome.identity.getRedirectURL();
const EXTENSION_PLAYLIST_NAME = 'マイ Shazam トラック';
const SPOTIFY_API_BASE_URL = 'https://api.spotify.com/v1';
const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';

// エラーメッセージ
const ERROR_MESSAGES = {
  AUTH_CANCELLED: '認証がキャンセルされました',
  AUTH_FAILED: '認証プロセスでエラーが発生しました',
  NO_REDIRECT_URL: '認証URLが取得できませんでした',
  INVALID_AUTH_RESPONSE: '認証レスポンスが不正です',
  INVALID_TOKEN: 'トークン情報が不正です',
  PLAYLIST_NOT_FOUND: `プレイリスト "${EXTENSION_PLAYLIST_NAME}" が見つかりませんでした。Spotifyで手動でプレイリストを作成してください。`,
  PLAYLIST_FETCH_FAILED: 'プレイリストの取得に失敗しました',
  TRACK_SEARCH_FAILED: '楽曲の検索に失敗しました',
  TRACK_NOT_FOUND: '楽曲が見つかりませんでした',
  ADD_TO_PLAYLIST_FAILED: 'プレイリストへの追加に失敗しました'
};

// ユーティリティ関数
function isTokenExpired(expiresAt) {
  return Date.now() >= expiresAt;
}

async function handleApiError(response, customMessage) {
  const errorText = await response.text();
  console.error(`${customMessage}:`, errorText);
  throw new Error(`${customMessage}: ${errorText}`);
}

// Spotify API関連の関数
async function getSpotifyToken() {
  try {
    const token = await chrome.storage.local.get('spotifyToken');
    if (token.spotifyToken && !isTokenExpired(token.spotifyToken.expiresAt)) {
      return token.spotifyToken.accessToken;
    }

    // リフレッシュトークンがある場合は、それを使用して新しいアクセストークンを取得
    if (token.spotifyToken?.refreshToken) {
      try {
        const newToken = await refreshSpotifyToken(token.spotifyToken.refreshToken);
        return newToken.accessToken;
      } catch (error) {
        console.error('トークンのリフレッシュに失敗:', error);
        // リフレッシュに失敗した場合は、通常の認証フローに進む
      }
    }

    const authUrl = `${SPOTIFY_AUTH_URL}?client_id=${SPOTIFY_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(SPOTIFY_REDIRECT_URI)}&scope=playlist-modify-public%20playlist-modify-private`;

    let redirectUrl;
    try {
      redirectUrl = await chrome.identity.launchWebAuthFlow({
        url: authUrl,
        interactive: true
      });
    } catch (e) {
      console.error('launchWebAuthFlow error:', e);
      throw new Error(e.message.includes('User cancelled') ? ERROR_MESSAGES.AUTH_CANCELLED : ERROR_MESSAGES.AUTH_FAILED);
    }

    if (!redirectUrl) {
      throw new Error(ERROR_MESSAGES.NO_REDIRECT_URL);
    }

    const code = new URL(redirectUrl).searchParams.get('code');
    if (!code) {
      throw new Error(ERROR_MESSAGES.INVALID_AUTH_RESPONSE);
    }

    // 認証コードを使用してアクセストークンとリフレッシュトークンを取得
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(SPOTIFY_CLIENT_ID + ':')
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: SPOTIFY_REDIRECT_URI
      })
    });

    if (!tokenResponse.ok) {
      throw new Error(ERROR_MESSAGES.INVALID_TOKEN);
    }

    const tokenData = await tokenResponse.json();
    const tokenInfo = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + tokenData.expires_in * 1000
    };

    await chrome.storage.local.set({ spotifyToken: tokenInfo });
    return tokenInfo.accessToken;
  } catch (e) {
    console.error('認証エラー:', e);
    throw e;
  }
}

async function refreshSpotifyToken(refreshToken) {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + btoa(SPOTIFY_CLIENT_ID + ':')
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  });

  if (!response.ok) {
    throw new Error(ERROR_MESSAGES.INVALID_TOKEN);
  }

  const tokenData = await response.json();
  const tokenInfo = {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || refreshToken, // リフレッシュトークンは新しいものが提供されない場合があります
    expiresAt: Date.now() + tokenData.expires_in * 1000
  };

  await chrome.storage.local.set({ spotifyToken: tokenInfo });
  return tokenInfo;
}

async function fetchSpotifyApi(endpoint, options = {}) {
  const token = await getSpotifyToken();
  const response = await fetch(`${SPOTIFY_API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      ...options.headers
    }
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response;
}

async function getPlaylists() {
  try {
    let allPlaylists = [];
    let nextUrl = `${SPOTIFY_API_BASE_URL}/me/playlists?limit=50`;

    while (nextUrl) {
      const response = await fetchSpotifyApi(nextUrl.replace(SPOTIFY_API_BASE_URL, ''));
      const data = await response.json();
      allPlaylists = allPlaylists.concat(data.items);
      nextUrl = data.next;
    }

    return {
      success: true,
      playlists: allPlaylists
    };
  } catch (error) {
    console.error('getPlaylists error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

async function searchTrack(title, artist) {
  try {
    const query = artist ? `${title} artist:${artist}` : title;
    const response = await fetchSpotifyApi(`/search?q=${encodeURIComponent(query)}&type=track&limit=1`);
    const data = await response.json();

    if (!data.tracks.items.length) {
      throw new Error(ERROR_MESSAGES.TRACK_NOT_FOUND);
    }

    return {
      success: true,
      track: data.tracks.items[0]
    };
  } catch (error) {
    console.error('searchTrack error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

async function addToPlaylist(playlistId, trackUri) {
  try {
    await fetchSpotifyApi(`/playlists/${playlistId}/tracks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        uris: [trackUri]
      })
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// メッセージハンドラー
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handlers = {
    GET_SPOTIFY_TOKEN_ONLY: async () => {
      try {
        const token = await getSpotifyToken();
        return { success: true, token, error: null };
      } catch (e) {
        return { success: false, error: e.message };
      }
    },
    GET_PLAYLISTS: async () => {
      return await getPlaylists();
    },
    ADD_TO_PLAYLIST: async () => {
      const searchResult = await searchTrack(message.track.title, message.track.artist);
      if (!searchResult.success) return searchResult;

      const playlistResult = await getPlaylists();
      if (!playlistResult.success) return playlistResult;

      const targetPlaylist = playlistResult.playlists.find(p => p.name === EXTENSION_PLAYLIST_NAME);
      if (!targetPlaylist) {
        return {
          success: false,
          error: ERROR_MESSAGES.PLAYLIST_NOT_FOUND
        };
      }

      return await addToPlaylist(targetPlaylist.id, searchResult.track.uri);
    }
  };

  const handler = handlers[message.type];
  if (handler) {
    handler().then(sendResponse);
    return true;
  }
});

// 拡張機能のアイコンがクリックされたときの処理
// chrome.action.onClicked.addListener(() => {
//   chrome.windows.create({
//     url: 'popup.html',
//     type: 'popup',
//     width: 400,
//     height: 600,
//     focused: true
//   });
// }); 