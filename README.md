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

## Google Drive

1. Google Cloud Consoleでプロジェクトを作成し、Google Drive APIを有効にします。
2. OAuth同意画面を設定し、「ウェブ アプリケーション」のOAuthクライアントIDを作成します。
3. ローカルURLとVercel本番・プレビューURLを「承認済みのJavaScript生成元」に登録します。Client Secretは使用しません。
4. 次の環境変数をVercelのProduction/Preview環境に設定します。

| 変数 | 内容 |
| --- | --- |
| `VITE_GOOGLE_CLIENT_ID` | ウェブ アプリケーションのOAuthクライアントID |

お気に入りはGoogle Driveの `WebAppsData` フォルダ（Folder ID: `1SWmOnYn98EN5nZs7Jsi3vBLkuJa4B_O6`）内の `settings.json` に保存されます。初回作成時に取得したFile IDをブラウザに保持し、次回以降はそのIDを使って同じファイルを上書きします。別のブラウザではフォルダ内のファイルを検索してIDを取得するため、既存データを引き継げます。保存前にサーバー上の最新版を読み、追加・削除操作だけをマージします。

## デプロイ

VercelではFramework PresetをVite、Build Commandを `npm run build`、Output Directoryを `dist` にします。Vercelの各オリジンをGoogle OAuthクライアントの「承認済みのJavaScript生成元」に登録してください。秘密情報やアクセストークンは環境変数にも登録しないでください（クライアントIDは公開識別子です）。
