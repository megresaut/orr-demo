import { useEffect } from 'react';

export default function PdfModal({ url, title, onClose, downloadName }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  if (!url) return null;

  return (
    <div className="pdf-overlay" onMouseDown={onClose} role="dialog" aria-modal="true">
      <div className="pdf-modal" onMouseDown={e => e.stopPropagation()}>
        <div className="pdf-modal-bar">
          <div className="pdf-modal-title">{title || 'Invoice preview'}</div>
          <div className="pdf-modal-actions">
            <a className="btn btn-ghost btn-sm" href={url} target="_blank" rel="noreferrer">Open in tab</a>
            <a className="btn btn-ghost btn-sm" href={url} download={downloadName || 'invoice.pdf'}>Download</a>
            <button className="btn btn-sm" onClick={onClose}>Close</button>
          </div>
        </div>
        <iframe className="pdf-modal-frame" src={url} title={title || 'Invoice preview'} />
      </div>
    </div>
  );
}
