import { createPortal } from 'react-dom';
import type { RemoteCode } from '../data/remoteCodes';
import { getGoogleDriveDisplayUrl } from '../services/googleDriveUrl';

export function ImageModal({ item, onClose }: { item: RemoteCode; onClose: () => void }) {
  return createPortal(
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="image-title">
        <button className="modal-close" onClick={onClose} aria-label="閉じる">× 閉じる</button>
        <p className="eyebrow">解説画像</p><h2 id="image-title"><span>{item.code}</span> {item.command}</h2>
        <img src={getGoogleDriveDisplayUrl(item.imageUrl!)} alt={`${item.code} ${item.command} の解説`} />
        <a className="primary-link" href={item.imageUrl} target="_blank" rel="noreferrer">Google Driveで開く</a>
      </section>
    </div>, document.getElementById('modal-root')!,
  );
}
