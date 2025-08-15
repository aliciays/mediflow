'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

import { getApp } from 'firebase/app';


export type Role = 'admin' | 'project_manager' | 'technician' | 'viewer';

type AppUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: Role;
  tags: string[];
};

type UseUserResult = {
  user: AppUser | null;
  loading: boolean;
};

export function useUser(): UseUserResult {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser: User | null) => {
      if (!fbUser) {
        setUser(null);
        setLoading(false);
        return;
      }
      try {
        // Leer documento en /users/{uid}
        console.log("UID que busca:", fbUser.uid);
        console.log("Firebase App name:", getApp().name);
        console.log("Firebase Project ID:", db.app.options.projectId);

        const ref = doc(db, 'users', fbUser.uid);
        const snap = await getDoc(ref);
        console.log("Existe documento?:", snap.exists());
        console.log("UID Firestore:", "AmwUoEiXhyPmMw4I8muwOMX4v3w1");
        console.log("UID que busca:", fbUser.uid);


        
        const data = snap.data();
        console.log("Datos Firestore:", snap.data());

        const roleFromDb = (data?.role as Role) || 'viewer';
        const tagsFromDb = (data?.tags as string[]) || [];

        setUser({
          uid: fbUser.uid,
          email: fbUser.email,
          displayName: fbUser.displayName || data?.displayName || '',
          role: roleFromDb,
          tags: tagsFromDb,
        });
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  return { user, loading };
}
