// Spotify APIの認証情報
const SPOTIFY_CLIENT_ID = '';
const SPOTIFY_REDIRECT_URI = chrome.identity.getRedirectURL();

// Spotifyトークンを取得
async function getSpotifyToken() {
  const token = await chrome.storage.local.get('spotifyToken');
  if (token && !isTokenExpired(token.expiresAt)) {
    return token.accessToken;
  }

  // 新しいトークンを取得
  const authUrl = `https://accounts.spotify.com/authorize?client_id=${SPOTIFY_CLIENT_ID}&response_type=token&redirect_uri=${encodeURIComponent(SPOTIFY_REDIRECT_URI)}&scope=playlist-modify-public%20playlist-modify-private`;

  const redirectUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl,
    interactive: true
  });

  if (redirectUrl) {
    const params = new URLSearchParams(redirectUrl.split('#')[1]);
    const accessToken = params.get('access_token');
    const expiresIn = parseInt(params.get('expires_in'));

    await chrome.storage.local.set({
      spotifyToken: {
        accessToken,
        expiresAt: Date.now() + expiresIn * 1000
      }
    });

    return accessToken;
  }

  throw new Error('認証に失敗しました');
}

// トークンの有効期限をチェック
function isTokenExpired(expiresAt) {
  return Date.now() >= expiresAt;
}

// プレイリストIDを取得
async function getPlaylistId() {
  const playlistId = await chrome.storage.local.get('playlistId');
  if (playlistId) {
    return playlistId;
  }

  // デフォルトのプレイリストを作成
  const token = await getSpotifyToken();
  const response = await fetch('https://api.spotify.com/v1/me/playlists', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  const data = await response.json();
  const defaultPlaylist = data.items.find(playlist => playlist.name === 'Saved from Browser');

  if (defaultPlaylist) {
    await chrome.storage.local.set({ playlistId: defaultPlaylist.id });
    return defaultPlaylist.id;
  }

  // 新しいプレイリストを作成
  const createResponse = await fetch('https://api.spotify.com/v1/me/playlists', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Saved from Browser',
      public: false
    })
  });

  const newPlaylist = await createResponse.json();
  await chrome.storage.local.set({ playlistId: newPlaylist.id });
  return newPlaylist.id;
}

// メッセージリスナー
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_SPOTIFY_TOKEN') {
    getSpotifyToken().then(token => sendResponse({ token }));
    return true;
  }
  if (message.type === 'GET_PLAYLIST_ID') {
    getPlaylistId().then(id => sendResponse({ id }));
    return true;
  }
}); 