'use client';

import { useUser } from '@/lib/useUser';
import { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function SettingsPage() {
  const { user } = useUser();
  const [tags, setTags] = useState<string[]>([]);
  const [lang, setLang] = useState('es');
  const [theme, setTheme] = useState('light');
  const [notif, setNotif] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) {
        const d = snap.data();
        setTags(d.tags || []);
        setLang(d.lang || 'es');
        setTheme(d.theme || 'light');
        setNotif(d.notifications ?? true);
      }
    })();
  }, [user]);

  const savePrefs = async () => {
    if (!user) return;
    await updateDoc(doc(db, 'users', user.uid), {
      tags, lang, theme, notifications: notif
    });
    alert('Preferencias guardadas');
  };

  if (!user) return <div className="p-6">Cargando…</div>;

  return (
    <div className="p-6 space-y-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold">Configuración</h1>

      {/* Perfil */}
      <section className="bg-white p-4 shadow rounded space-y-2">
        <h2 className="font-semibold text-lg">Perfil</h2>
        <p><strong>Nombre:</strong> {user.displayName || '—'}</p>
        <p><strong>Email:</strong> {user.email}</p>
        <p><strong>Rol:</strong> {user.role}</p>
      </section>


      <section className="bg-white p-4 shadow rounded space-y-4">
        <h2 className="font-semibold text-lg">Preferencias</h2>
        <div>
          <label className="block text-sm">Idioma</label>
          <select value={lang} onChange={e => setLang(e.target.value)} className="border rounded p-2">
            <option value="es">Español</option>
            <option value="en">Inglés</option>
          </select>
        </div>
        <div>
          <label className="block text-sm">Tema</label>
          <select value={theme} onChange={e => setTheme(e.target.value)} className="border rounded p-2">
            <option value="light">Claro</option>
            <option value="dark">Oscuro</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" checked={notif} onChange={e => setNotif(e.target.checked)} />
          <span>Recibir notificaciones críticas</span>
        </div>
      </section>

      {user.role === 'technician' && (
        <section className="bg-white p-4 shadow rounded space-y-2">
          <h2 className="font-semibold text-lg">Competencias</h2>
          <input
            type="text"
            className="border rounded p-2 w-full"
            placeholder="Añadir etiqueta y pulsa Enter"
            onKeyDown={e => {
              if (e.key === 'Enter' && e.currentTarget.value) {
                setTags([...tags, e.currentTarget.value]);
                e.currentTarget.value = '';
              }
            }}
          />
          <div className="flex gap-2 flex-wrap">
            {tags.map((t, i) => (
              <span key={i} className="px-2 py-1 bg-blue-100 text-blue-700 rounded">
                {t}
              </span>
            ))}
          </div>
        </section>
      )}

      <button
        onClick={savePrefs}
        className="px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700"
      >
        Guardar cambios
      </button>
    </div>
  );
}
