'use client';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

export default function AboutPage() {
  const router = useRouter();

  return (
    <main className="bg-gray-50 text-slate-800">
      <section className="container mx-auto px-6 py-16 text-center">
        <h1 className="text-4xl font-extrabold mb-4">Acerca de MediFlow</h1>
        <p className="max-w-3xl mx-auto text-lg text-slate-600">
          MediFlow es una plataforma CRM pensada para equipos técnicos que trabajan con dispositivos médicos.
          Te ayuda a planificar proyectos, coordinar tareas y dar visibilidad al progreso con estándares y trazabilidad.
        </p>
      </section>

      <section className="container mx-auto px-6 py-10 grid md:grid-cols-2 gap-10 items-center">
        <div>
          <h2 className="text-2xl font-bold mb-3">Nuestra misión</h2>
          <p className="text-slate-600">
            Hacer que los equipos técnicos trabajen con más claridad, menos fricción y mejor comunicación,
            especialmente en entornos regulados donde la trazabilidad es clave.
          </p>
          <ul className="mt-4 space-y-2 text-slate-700">
            <li>• Estructura de fases, tareas y subtareas.</li>
            <li>• Asignación por roles y responsables.</li>
            <li>• Cronogramas, hitos y reportes ejecutivos.</li>
            <li>• Analítica operativa y carga de trabajo.</li>
          </ul>
        </div>
        <div className="flex justify-center">
          <Image
            src="/landing/hero.jpg"
            alt="MediFlow dashboard"
            width={600}
            height={380}
            className="rounded-xl shadow-lg object-contain bg-white"
          />
        </div>
      </section>

      <section className="bg-white py-16">
        <div className="container mx-auto px-6">
          <h2 className="text-2xl font-bold text-center mb-10">Módulos principales</h2>
          <div className="grid lg:grid-cols-3 gap-8">
            {[
              { img: '/landing/projects.png', title: 'Proyectos', desc: 'Planifica por fases, tareas y subtareas con dependencias claras.' },
              { img: '/landing/tasks.png', title: 'Tareas', desc: 'Asigna responsables y gestiona estado y prioridades.' },
              { img: '/landing/timeline.png', title: 'Cronograma', desc: 'Visualiza plazos, hitos y el avance en un mismo lugar.' },
            ].map((card, i) => (
              <div key={i} className="bg-gray-50 rounded-xl p-5 shadow-sm hover:shadow-md transition">
                <div className="h-28 flex items-center justify-center mb-4">
                  <Image src={card.img} alt={card.title} width={260} height={160} className="object-contain max-h-full" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{card.title}</h3>
                <p className="text-slate-600">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-gradient-to-r from-blue-600 to-teal-500 text-white py-20 text-center">
        <h2 className="text-3xl font-bold mb-4">
          ¿Listo para empezar?
        </h2>
        <p className="mb-8 text-lg/7 opacity-90">Crea tu cuenta o accede para organizar tus proyectos hoy mismo.</p>

        <button
          onClick={() => router.push("/login")}
          className="
            inline-flex items-center justify-center
            h-11 px-8
            rounded-lg
            bg-white text-blue-700
            font-semibold
            shadow
            transition
            hover:bg-slate-100
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-blue-700
          "
        >
          Iniciar sesión ahora
        </button>
      </section>
      <footer className="py-6 text-center text-slate-500 text-sm">
        © {new Date().getFullYear()} MediFlow · Todos los derechos reservados
      </footer>
    </main>
  );
}
