// 定数
const AUDD_API_KEY = ''; // 開発用のAPIキー
const AUDD_API_URL = 'https://api.audd.io/';
const RECORDING_DURATION = 10000; // 10秒
const RECOGNITION_TIMEOUT = 20000; // 20秒
const RECORDING_DURATION_SECONDS = RECORDING_DURATION / 1000; // 秒数に変換

// エラーメッセージ
const ERROR_MESSAGES = {
  AUTH_REQUIRED: 'Spotify認証を先に行ってください',
  TRACK_REQUIRED: '先に楽曲を認識してください',
  NO_AUTH_RESPONSE: '認証レスポンスがありません',
  AUTH_FAILED: '認証に失敗しました',
  NO_TOKEN: 'トークンが取得できませんでした',
  NO_PLAYLIST_RESPONSE: 'プレイリストの確認に失敗しました',
  CAPTURE_FAILED: '音声キャプチャに失敗しました',
  RECOGNITION_TIMEOUT: '認識がタイムアウトしました',
  API_ERROR: 'API通信エラー',
  NO_RECOGNITION: '楽曲が認識できませんでした',
  NO_SPOTIFY_RESPONSE: 'Spotifyからのレスポンスがありません',
  ADD_FAILED: 'プレイリストへの追加に失敗しました',
  GENERAL_ERROR: 'エラーが発生しました'
};

// 状態管理
const state = {
  currentTrack: null,
  isAuthenticated: false,
  hasPlaylist: false
};

// UI関連の関数
function updateAuthState(authenticated, hasPlaylist) {
  state.isAuthenticated = authenticated;
  state.hasPlaylist = hasPlaylist;
  document.getElementById('spotify-auth').disabled = authenticated;
  document.getElementById('recognize-audio').disabled = !authenticated || !hasPlaylist;
}

function updateTrackInfo(track) {
  const trackNameElement = document.getElementById('track-name');
  if (track) {
    state.currentTrack = track;
    trackNameElement.textContent = `${track.title} - ${track.artist}`;
  } else {
    trackNameElement.textContent = '未認識';
  }
}

function showStatus(message, isError = false) {
  const statusElement = document.getElementById('status');
  statusElement.textContent = message;
  statusElement.className = `status ${isError ? 'error' : 'success'}`;
}

// 音声認識関連の関数
async function captureAudio() {
  return new Promise((resolve, reject) => {
    chrome.tabCapture.capture({ audio: true, video: false }, (stream) => {
      if (!stream) {
        reject(new Error(ERROR_MESSAGES.CAPTURE_FAILED));
        return;
      }
      resolve(stream);
    });
  });
}

async function recordAudio(stream) {
  return new Promise((resolve) => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(audioContext.destination);
    const mediaRecorder = new MediaRecorder(stream);
    const chunks = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(chunks, { type: 'audio/webm' });
      resolve({ audioBlob, audioContext });
    };

    mediaRecorder.start();

    // カウントダウン処理
    let remainingSeconds = RECORDING_DURATION_SECONDS;
    const countdownInterval = setInterval(() => {
      remainingSeconds--;
      showStatus(`録音中...（${remainingSeconds}秒）`);
    }, 1000);

    setTimeout(() => {
      clearInterval(countdownInterval);
      mediaRecorder.stop();
      stream.getTracks().forEach(track => track.stop());
    }, RECORDING_DURATION);
  });
}

async function recognizeAudioWithAudd(audioBlob) {
  const formData = new FormData();
  formData.append('api_token', AUDD_API_KEY);
  formData.append('file', audioBlob, 'audio.webm');
  formData.append('return', 'spotify');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RECOGNITION_TIMEOUT);

  try {
    const response = await fetch(AUDD_API_URL, {
      method: 'POST',
      body: formData,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// メイン処理
async function handleSpotifyAuth() {
  try {
    showStatus('Spotify認証中...');
    const response = await chrome.runtime.sendMessage({ type: 'GET_SPOTIFY_TOKEN_ONLY' });

    if (!response) throw new Error(ERROR_MESSAGES.NO_AUTH_RESPONSE);
    if (!response.success) throw new Error(response.error || ERROR_MESSAGES.AUTH_FAILED);
    if (!response.token) throw new Error(ERROR_MESSAGES.NO_TOKEN);

    showStatus('プレイリストを確認中...');
    const playlistResponse = await chrome.runtime.sendMessage({ type: 'GET_PLAYLISTS' });
    if (!playlistResponse?.success) {
      throw new Error(playlistResponse?.error || ERROR_MESSAGES.NO_PLAYLIST_RESPONSE);
    }

    updateAuthState(true, true);
    showStatus('準備完了！楽曲認識を開始します...');

    // 認証成功後に自動的に楽曲認識を開始
    await recognizeAudio();
  } catch (error) {
    console.error('Spotify認証エラー:', error);
    showStatus('Spotify認証失敗: ' + error.message, true);
    updateAuthState(false, false);
  }
}

async function recognizeAudio() {
  if (!state.isAuthenticated) {
    showStatus(ERROR_MESSAGES.AUTH_REQUIRED, true);
    return;
  }

  const recognizeBtn = document.getElementById('recognize-audio');
  recognizeBtn.disabled = true;
  showStatus(`録音中...（${RECORDING_DURATION_SECONDS}秒）`);

  try {
    const stream = await captureAudio();
    const { audioBlob, audioContext } = await recordAudio(stream);

    showStatus('楽曲を認識中...');
    const data = await recognizeAudioWithAudd(audioBlob);

    if (data.result) {
      const track = {
        title: data.result.title,
        artist: data.result.artist
      };
      updateTrackInfo(track);
      showStatus('楽曲を認識しました！プレイリストに追加中...');
      await handleAddToPlaylist();
    } else {
      updateTrackInfo(null);
      showStatus(ERROR_MESSAGES.NO_RECOGNITION, true);
    }
  } catch (error) {
    updateTrackInfo(null);
    if (error.name === 'AbortError' || error.message.includes('aborted')) {
      showStatus(ERROR_MESSAGES.RECOGNITION_TIMEOUT, true);
    } else {
      showStatus(ERROR_MESSAGES.API_ERROR, true);
    }
  } finally {
    recognizeBtn.disabled = false;
  }
}

async function handleAddToPlaylist() {
  if (!state.isAuthenticated) {
    showStatus(ERROR_MESSAGES.AUTH_REQUIRED, true);
    return;
  }
  if (!state.currentTrack) {
    showStatus(ERROR_MESSAGES.TRACK_REQUIRED, true);
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'ADD_TO_PLAYLIST',
      track: state.currentTrack
    });

    if (!response?.success) {
      showStatus(response?.error || ERROR_MESSAGES.ADD_FAILED, true);
      return;
    }

    showStatus('プレイリストに追加しました！');
  } catch (error) {
    console.error(error);
    showStatus(ERROR_MESSAGES.GENERAL_ERROR, true);
  }
}

// イベントリスナーの設定
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('spotify-auth').addEventListener('click', handleSpotifyAuth);
  document.getElementById('recognize-audio').addEventListener('click', recognizeAudio);

  updateTrackInfo(null);
  updateAuthState(false, false);

  // 自動的にSpotify認証を実行
  handleSpotifyAuth();
}); 