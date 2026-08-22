# SRC Remote Code Finder

現場でSRCリモコンのコードをモード別に検索し、OneDrive上のお気に入りを複数端末で共有するReact/Viteアプリです。検索はクラウド接続なしでも動作します。

## セットアップ

```bash
cp .env.example .env.local
npm install
npm run dev
```

コードデータは `src/data/remoteCodes.ts` の `remoteCodes` で管理します。コードは文字列のまま、原本の表記・重複・備考の改行を保持してください。OneDrive画像の共有URLは各レコードの `imageUrl` に登録します。

提供されたSRCコード495件を収録しています。重複コード、コマンド空欄、範囲表記、備考の改行も削除・補正せず保持しています。

## Microsoft Graph / OneDrive

1. Microsoft Entra管理センターで「アプリの登録」を作成します。
2. 「認証」で **シングルページ アプリケーション (SPA)** を追加し、ローカルURLとVercel本番URLをリダイレクトURIに登録します。本アプリはAuthorization Code + PKCEを使用し、Client Secretは不要です。
3. Microsoft Graphの委任アクセス許可 `Files.ReadWrite.AppFolder` を追加します。
4. 次の環境変数をVercelのProduction/Preview環境に設定します。

| 変数 | 内容 |
| --- | --- |
| `VITE_AZURE_CLIENT_ID` | アプリケーション（クライアント）ID |
| `VITE_AZURE_TENANT_ID` | ディレクトリ（テナント）ID。組織を限定しない場合は `common` |
| `VITE_AZURE_REDIRECT_URI` | 登録済みのデプロイURL |

お気に入りはGraphのApp Folder (`Apps/<アプリ名>/settings.json`) に保存されます。保存前にサーバー上の最新版を読み、追加・削除操作だけをマージします。UI、認証、保存処理はそれぞれ分離されています。

## デプロイ

VercelではFramework PresetをVite、Build Commandを `npm run build`、Output Directoryを `dist` にします。Vercelの各URLをEntraのSPAリダイレクトURIへ完全一致で登録してください。秘密情報やアクセストークンは環境変数にも登録しないでください（クライアントIDは公開識別子です）。
