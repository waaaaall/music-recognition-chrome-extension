let currentTrack = null;

const AUDD_API_KEY = ''; // ここに取得したAPIキーを入力

function updateTrackInfo(track) {
  const trackNameElement = document.getElementById('track-name');
  if (track) {
    currentTrack = track;
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

async function recognizeAudio() {
  const recognizeBtn = document.getElementById('recognize-audio');
  recognizeBtn.disabled = true;
  showStatus('録音中...（10秒間）');
  chrome.tabCapture.capture({ audio: true, video: false }, async (stream) => {
    if (!stream) {
      showStatus('音声キャプチャに失敗しました', true);
      recognizeBtn.disabled = false;
      return;
    }
    // AudioContextでスピーカーにも流す
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(audioContext.destination);

    const mediaRecorder = new MediaRecorder(stream);
    let chunks = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(chunks, { type: 'audio/webm' });
      const formData = new FormData();
      formData.append('api_token', AUDD_API_KEY);
      formData.append('file', audioBlob, 'audio.webm');
      formData.append('return', 'spotify');
      showStatus('楽曲を認識中...');
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000); // 10秒タイムアウト
        const res = await fetch('https://api.audd.io/', {
          method: 'POST',
          body: formData,
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        const data = await res.json();
        if (data.result) {
          updateTrackInfo({
            title: data.result.title,
            artist: data.result.artist
          });
          showStatus('楽曲を認識しました！');
        } else {
          updateTrackInfo(null);
          showStatus('楽曲が認識できませんでした', true);
        }
      } catch (e) {
        updateTrackInfo(null);
        console.log(e);
        if (
          e.name === 'AbortError' ||
          (typeof e.message === 'string' && (e.message.includes('signal') || e.message.includes('aborted')))
        ) {
          showStatus('認識がタイムアウトしました', true);
        } else {
          showStatus('API通信エラー', true);
        }
      } finally {
        recognizeBtn.disabled = false;
        // AudioContextを解放
        audioContext.close();
      }
    };
    mediaRecorder.start();
    setTimeout(() => {
      mediaRecorder.stop();
      stream.getTracks().forEach(track => track.stop());
    }, 10000);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('recognize-audio').addEventListener('click', recognizeAudio);
  updateTrackInfo(null);
  recognizeAudio(); // ポップアップ起動時に自動録音
}); 