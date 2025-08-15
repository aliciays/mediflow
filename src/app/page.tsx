// app/page.tsx
"use client";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <h1 className="text-4xl font-bold mb-4">Bienvenido a MediFlow</h1>
      <p className="mb-6 text-gray-700 text-center max-w-lg">
        Plataforma CRM especializada para la gestión de proyectos técnicos en dispositivos médicos.
        Gestiona proyectos, asigna tareas y visualiza el progreso con facilidad.
      </p>
      <button
        onClick={() => router.push("/login")}
        className="px-6 py-3 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700"
      >
        Iniciar sesión
      </button>
    </main>
  );
}
