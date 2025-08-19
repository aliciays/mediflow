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
    <main className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
      <h1 className="text-3xl font-bold mb-4">Iniciar sesión</h1>
      <input
        type="email"
        placeholder="Correo electrónico"
        className="border p-2 mb-2 w-64"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        type="password"
        placeholder="Contraseña"
        className="border p-2 mb-4 w-64"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button
        onClick={handleLogin}
        className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Entrar
      </button>
    </main>
  );
}
