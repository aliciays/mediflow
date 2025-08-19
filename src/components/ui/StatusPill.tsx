'use client';
import { useState, useRef, useEffect } from 'react';

export type StatusValue = 'todo' | 'in_progress' | 'completed';

const OPTIONS: { value: StatusValue; label: string; badge: string }[] = [
  { value: 'todo',        label: 'Pendiente',   badge: 'bg-slate-100 text-slate-700' },
  { value: 'in_progress', label: 'En progreso', badge: 'bg-yellow-100 text-yellow-700' },
  { value: 'completed',   label: 'Completada',  badge: 'bg-green-100 text-green-700' },
];

function labelOf(v?: string) {
  return OPTIONS.find(o => o.value === v)?.label ?? 'Pendiente';
}
function badgeOf(v?: string) {
  return OPTIONS.find(o => o.value === v)?.badge ?? 'bg-slate-100 text-slate-700';
}

export default function StatusPill({
  value,
  onChange,
  disabled = false,
  className = '',
}: {
  value?: StatusValue;
  onChange: (next: StatusValue) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // cerrar al hacer click fuera / ESC
  useEffect(() => {
    const click = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', click);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', click); document.removeEventListener('keydown', esc); };
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className={`rounded px-2 py-0.5 text-xs ${badgeOf(value)} disabled:opacity-50`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {labelOf(value)}
      </button>

      {open && !disabled && (
        <div role="menu" className="absolute z-10 mt-1 w-44 overflow-hidden rounded-xl border bg-white shadow">
          {OPTIONS.map(opt => (
            <button
              key={opt.value}
              role="menuitem"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
              onClick={() => { setOpen(false); onChange(opt.value); }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
