# Spotify Playlist Adder

現在再生中の曲をSpotifyプレイリストに追加するChrome拡張機能です。

## 開発者向けセットアップ

### 必要なAPIキーの取得

#### Spotify API
1. [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)にアクセス
2. Spotifyアカウントでログイン
3. 「Create App」をクリック
4. アプリ名と説明を入力
5. リダイレクトURIに`https://<your-extension-id>.chromiumapp.org/`を追加
   - 拡張機能IDは`chrome://extensions`で確認可能
6. 作成後、Client IDを取得

#### Audd.io API
1. [Audd.io](https://audd.io/)にアクセス
2. アカウントを作成
3. ダッシュボードからAPIトークンを取得

### 環境設定
1. リポジトリをクローン
2. `background.js`の以下の定数を設定：
   ```javascript
   const SPOTIFY_CLIENT_ID = 'your_client_id'; // Spotify Developer Dashboardで取得したClient ID
   const SPOTIFY_REDIRECT_URI = chrome.identity.getRedirectURL(); // 自動的に設定されます
   const EXTENSION_PLAYLIST_NAME = 'マイ Shazam トラック'; // 任意のプレイリスト名に変更可能
   ```
3. `popup.js`の以下の定数を設定：
   ```javascript
   const AUDD_API_KEY = 'your_api_key'; // Audd.ioで取得したAPIキー
   ```

### 注意事項
- APIキーは公開リポジトリにコミットしないでください
- 本番環境では環境変数や安全な方法でAPIキーを管理してください
- Spotify APIの利用には[利用規約](https://developer.spotify.com/documentation/general/legal/terms-of-use/)に同意が必要です
- Audd.io APIの利用には[利用規約](https://audd.io/terms)に同意が必要です
- プレイリスト名は`EXTENSION_PLAYLIST_NAME`で指定した名前で自動的に作成されます

## クイックスタート

### 前提条件
- Google Chrome バージョン88以上
- Spotifyアカウント
- インターネット接続

### 5分で始める
1. [リリースページ](https://github.com/yourusername/spotify-playlist-adder/releases)から最新の`.zip`ファイルをダウンロード
2. ダウンロードしたファイルを解凍
3. Chromeで`chrome://extensions/`を開く
4. デベロッパーモードを有効化
5. 「パッケージ化されていない拡張機能を読み込む」で解凍したフォルダを選択
6. 拡張機能のアイコンをクリックして「Spotifyにログイン」
7. 音楽を再生して「今流れている曲を認識」をクリック

### トラブルシューティング
- 認証エラーが発生した場合：ブラウザを再起動して再度試してください
- 曲が認識されない場合：音量を上げて再度試してください
- プレイリストに追加できない場合：Spotifyにログインしていることを確認してください

## 機能

- 現在再生中の曲を自動認識
- Spotifyプレイリストへの楽曲追加
- シンプルで使いやすいUI

## ディレクトリ構造

```
spotify/
├── background.js      # バックグラウンドスクリプト
├── popup.js          # ポップアップUIのロジック
├── popup.html        # ポップアップUIのマークアップ
├── manifest.json     # 拡張機能の設定ファイル
├── LICENSE          # ライセンスファイル
└── README.md        # このファイル
```

## インストール方法

1. このリポジトリをクローンまたはダウンロードします
2. Chromeブラウザで `chrome://extensions/` を開きます
3. 右上の「デベロッパーモード」をオンにします
4. 「パッケージ化されていない拡張機能を読み込む」をクリックします
5. ダウンロードしたフォルダを選択します

## 使用方法

1. 拡張機能のアイコンをクリックしてポップアップを開きます
2. 「Spotifyにログイン」ボタンをクリックして認証を行います
3. 「今流れている曲を認識」ボタンをクリックして曲を認識します
4. 認識された曲は自動的にSpotifyプレイリストに追加されます

## 必要な権限

- `activeTab`: 現在のタブの情報にアクセス
- `storage`: 設定の保存
- `identity`: Spotify認証
- `tabCapture`: オーディオ認識

## 技術スタック

- JavaScript
- Chrome Extension API
- Spotify Web API
- Audd.io API

## ライセンス

MITライセンスの下で公開されています。詳細は[LICENSE](LICENSE)ファイルを参照してください。