import { useEffect, useMemo, useRef, useState } from 'react';

// Searchable single-select. Filters by label or value substring.
// Pass `indent` to visually nest options whose `value` is a dotted code
// (e.g. "1.01.02" indents one level under "1.01").
export default function Combobox({
  value,
  onChange,
  options,
  placeholder = '',
  required = false,
  disabled = false,
  indent = false,
  allowEmptyLabel = '',
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hi, setHi] = useState(0);
  const inputRef = useRef(null);
  const wrapRef = useRef(null);

  const fullOptions = useMemo(() => (
    allowEmptyLabel ? [{ value: '', label: allowEmptyLabel }, ...options] : options
  ), [options, allowEmptyLabel]);

  const selected = useMemo(
    () => fullOptions.find(o => o.value === value) || null,
    [fullOptions, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return fullOptions;
    return fullOptions.filter(o =>
      o.label.toLowerCase().includes(q) ||
      String(o.value || '').toLowerCase().includes(q)
    );
  }, [fullOptions, query]);

  useEffect(() => {
    function onDocMouseDown(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  function pick(o) {
    onChange(o.value);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  }

  function onKey(e) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter')) {
      setOpen(true); return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[hi]) pick(filtered[hi]); }
    else if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
  }

  const displayValue = open ? query : (selected?.label || '');

  return (
    <div ref={wrapRef} className="combobox">
      <input
        ref={inputRef}
        type="text"
        className="combobox-input"
        value={displayValue}
        onChange={e => { setQuery(e.target.value); setOpen(true); setHi(0); }}
        onFocus={() => { setOpen(true); setQuery(''); setHi(0); }}
        onKeyDown={onKey}
        placeholder={placeholder}
        required={required && !value}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
      />
      <span className="combobox-caret" aria-hidden>▾</span>
      {open && (
        <div className="combobox-list" role="listbox">
          {filtered.length === 0 && (
            <div className="combobox-empty">No matches</div>
          )}
          {filtered.map((o, i) => {
            const dotDepth = indent && o.value
              ? Math.max(0, (String(o.value).match(/\./g) || []).length - 1)
              : 0;
            return (
              <div
                key={o.value || '__empty'}
                role="option"
                aria-selected={o.value === value}
                className={'combobox-item' + (i === hi ? ' hi' : '') + (o.value === value ? ' selected' : '')}
                onMouseDown={e => { e.preventDefault(); pick(o); }}
                onMouseEnter={() => setHi(i)}
                style={{ paddingLeft: 12 + dotDepth * 18 }}
              >
                {o.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
