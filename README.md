# SRC Remote Code Finder

現場でSRCリモコンのコードをモード別に検索し、Google Drive上のお気に入りを複数端末で共有するReact/Viteアプリです。検索はクラウド接続なしでも動作します。

## セットアップ

```bash
cp .env.example .env.local
npm install
npm run dev
```

コードデータは `src/data/remoteCodes.ts` の `remoteCodes` で管理します。コードは文字列のまま、原本の表記・重複・備考の改行を保持してください。Google Drive画像の共有URLは各レコードの `imageUrl` に登録します。

提供されたSRCコード495件を収録しています。重複コード、コマンド空欄、範囲表記、備考の改行も削除・補正せず保持しています。

## 説明画像の登録

1. 画像をGoogle Driveへアップロードします。
2. 画像の共有設定を「リンクを知っている全員」か、アプリ利用者全員が閲覧できる設定にします。
3. 画像を右クリックして「共有」→「リンクをコピー」を選びます。
4. アプリで対象コードの「画像URLを登録」（登録済みの場合は「画像URLを変更」）を押します。
5. クリップボードから読み込まれたURLと対象コードを確認し、「登録」を押します。

```ts
{ mode: '2_MANUAL', code: '2000', command: '走行JOG (Blocking制御あり)', imageUrl: 'https://drive.google.com/file/d/FILE_ID/view?usp=sharing' },
```

登録したURLはお気に入りと同じGoogle Drive上の `settings.json` に保存され、`remoteCodes.ts` の初期URLより優先されます。登録後は「説明画像を見る」から画像を表示でき、その他メニューの「画像を削除」で画像なしの状態へ戻せます。Google Driveの通常の共有URLは、モーダル表示時に画像表示用URLへ自動変換されます。「Google Driveで開く」リンクには登録した共有URLをそのまま使用します。

## 備考の追加・編集

各コードカードの「備考を追加」または「備考を編集」から、改行を含む備考を入力して保存できます。画面から保存した備考はGoogle Driveの `settings.json` に保存され、`remoteCodes.ts` の初期値より優先されます。編集画面を空欄にして保存すると、そのコードの備考を削除できます。

## Google Drive

1. Google Cloud Consoleでプロジェクトを作成し、Google Drive APIを有効にします。
2. OAuth同意画面を設定し、「ウェブ アプリケーション」のOAuthクライアントIDを作成します。
3. ローカルURLとVercel本番・プレビューURLを「承認済みのJavaScript生成元」に登録します。Client Secretは使用しません。
4. 次の環境変数をVercelのProduction/Preview環境に設定します。

| 変数 | 内容 |
| --- | --- |
| `VITE_GOOGLE_CLIENT_ID` | ウェブ アプリケーションのOAuthクライアントID |

お気に入りと画像URLはGoogle Driveの `WebAppsData` フォルダ（Folder ID: `1SWmOnYn98EN5nZs7Jsi3vBLkuJa4B_O6`）内に作成する `SRC-RemoteCodeFinder/settings.json` に保存されます。アプリフォルダと設定ファイルのIDをブラウザに保持し、次回以降はIDを検証して同じ場所を使用します。IDが未保存または無効な場合も、既存の `SRC-RemoteCodeFinder` フォルダを名前と親フォルダで検索してから作成するため、同名フォルダを繰り返し作成しません。旧バージョンが `WebAppsData` 直下に保存した `settings.json` は初回アクセス時にアプリフォルダへ移動します。

## デプロイ

VercelではFramework PresetをVite、Build Commandを `npm run build`、Output Directoryを `dist` にします。Vercelの各オリジンをGoogle OAuthクライアントの「承認済みのJavaScript生成元」に登録してください。秘密情報やアクセストークンは環境変数にも登録しないでください（クライアントIDは公開識別子です）。
