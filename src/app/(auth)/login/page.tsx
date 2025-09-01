// app/(auth)/login/page.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { app } from "@/lib/firebase"; // tu inicialización de Firebase

export default function LoginPage() {
  const router = useRouter();
  const auth = getAuth(app);
  const db = getFirestore(app);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async () => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;
      const userDoc = await getDoc(doc(db, "users", uid));

      if (userDoc.exists()) {
        const role = userDoc.data().role;
        console.log("🔥 ROLE DETECTADO:", role);

        switch (role) {
          case "admin":
            router.push("/dashboard/admin");
            break;
          case "project_manager":
            router.push("/dashboard/pm");
            break;
          case "technician":
            router.push("/dashboard/tech");
            break;
          case "viewer":
            router.push("/dashboard/viewer");
            break;
          default:
            router.push("/");
        }
      } else {
        alert("No se encontró el perfil del usuario.");
      }
    } catch (error) {
      console.error(error);
      alert("Error de login");
    }
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white shadow-md rounded-xl p-8">
        <h1 className="text-2xl font-bold text-center mb-6 text-slate-800">
          Iniciar sesión
        </h1>

        <div className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Correo electrónico"
            className="
              w-full h-11 px-4
              border border-slate-300 rounded-lg
              focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400
              text-slate-700 placeholder-slate-400
            "
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="Contraseña"
            className="
              w-full h-11 px-4
              border border-slate-300 rounded-lg
              focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400
              text-slate-700 placeholder-slate-400
            "
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button
            onClick={handleLogin}
            className="
              w-full h-11
              rounded-lg
              bg-blue-600 text-white font-semibold
              shadow-sm
              transition
              hover:bg-blue-700
              focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2
              disabled:opacity-50 disabled:cursor-not-allowed
            "
          >
            Entrar
          </button>
        </div>

        {/* Opcional: enlaces de apoyo */}
        <div className="mt-6 text-center text-sm">
          <a href="#" className="text-blue-600 hover:underline">
            ¿Olvidaste tu contraseña?
          </a>
        </div>
      </div>
    </main>
  );

}
