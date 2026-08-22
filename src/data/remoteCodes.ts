export const modes = [
  { id: '2_MANUAL', label: '手動操作' },
  { id: '3_INDEX', label: '半自動・動作指定' },
  { id: '4_TEACH', label: 'ティーチング' },
  { id: '6_MAP', label: 'MAP情報' },
  { id: '8_DISP', label: '状態・情報表示' },
  { id: '9_Mainte', label: 'メンテナンス' },
] as const;

export type RemoteMode = (typeof modes)[number]['id'];
export type RemoteCode = {
  mode: RemoteMode;
  code: string;
  command: string;
  note?: string;
  imageUrl?: string;
  warning?: boolean;
};

// コード、表記、重複、改行は原本どおりに保持します。画像共有URLは imageUrl に登録してください。
// 現時点では依頼文中に明示されたレコードのみ収録しています。
export const remoteCodes: RemoteCode[] = [
  { mode: '2_MANUAL', code: '2000', command: '走行JOG (Blocking制御あり)', note: '', imageUrl: '' },
  { mode: '2_MANUAL', code: '2001', command: '走行JOG (Blocking制御なし)', note: '', imageUrl: '' },
  { mode: '8_DISP', code: '8061', command: '', note: '', imageUrl: '' },
  { mode: '9_Mainte', code: '9201', command: '走行servo OFF', imageUrl: '' },
  { mode: '9_Mainte', code: '9202', command: '走行servo ON', imageUrl: '' },
  { mode: '9_Mainte', code: '9203', command: '昇降servo OFF', imageUrl: '' },
  { mode: '9_Mainte', code: '9204', command: '昇降servo ON', imageUrl: '' },
  { mode: '9_Mainte', code: '9405', command: '昇降距離 reset', imageUrl: '', warning: true },
  { mode: '9_Mainte', code: '9622', command: '強制昇降', imageUrl: '', warning: true },
  { mode: '9_Mainte', code: '9999', command: '制限解除', imageUrl: '', warning: true },
];
