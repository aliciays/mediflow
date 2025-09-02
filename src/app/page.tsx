"use client";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function HomePage() {
  const router = useRouter();

  return (
    <main className="bg-gray-50 text-slate-800">

      <section className="container mx-auto px-6 py-20 flex flex-col lg:flex-row items-center gap-10">
        <div className="flex-1 text-center lg:text-left">
          <h1 className="text-5xl font-bold mb-6">
            Bienvenido a <span className="text-blue-600">MediFlow</span>
          </h1>
          <p className="mb-8 text-lg text-slate-600">
            Plataforma CRM especializada en la gestión de proyectos técnicos en
            dispositivos médicos. Organiza, asigna y visualiza el progreso con facilidad.
          </p>

    
          <div className="flex gap-4 justify-center lg:justify-start">
  
            <button
              onClick={() => router.push("/login")}
              className="
                inline-flex items-center justify-center
                h-11 min-w-[44px] px-6
                rounded-lg
                bg-blue-600 text-white
                font-medium
                shadow-sm
                transition
                hover:bg-blue-700
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            >
              Iniciar sesión
            </button>

     
            <button
              onClick={() => router.push("/about")}
              className="
                inline-flex items-center justify-center
                h-11 min-w-[44px] px-6
                rounded-lg
                border border-blue-600 text-blue-600
                font-medium
                transition
                hover:bg-blue-50
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 focus-visible:ring-offset-2
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            >
              Saber más
            </button>
          </div>
        </div>

        <div className="flex-1">
          <Image
            src="/landing/hero.jpg"
            alt="Ilustración MediFlow"
            width={600}
            height={400}
            className="rounded-xl shadow-lg"
          />
        </div>
      </section>

      {/* Features */}
      <section className="bg-white py-16">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold mb-10">Lo que te ofrece MediFlow</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { img: "/landing/projects.png", title: "Gestión jerárquica", desc: "Estructura fases, tareas y subtareas con claridad." },
              { img: "/landing/tasks.png", title: "Asignación inteligente", desc: "Asigna responsables según etiquetas y roles." },
              { img: "/landing/timeline.png", title: "Cronogramas claros", desc: "Visualiza hitos, plazos y reportes en un solo lugar." },
            ].map((f, i) => (
              <div
                key={i}
                className="p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition bg-white"
              >
                <div className="h-32 md:h-40 flex items-center justify-center mb-5">
                  <Image
                    src={f.img}
                    alt={f.title}
                    width={320}
                    height={220}
                    className="object-contain max-h-full"
                    priority={i === 0}
                  />
                </div>
                <h3 className="text-xl font-semibold mb-2">{f.title}</h3>
                <p className="text-slate-600">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>


      <section className="bg-gradient-to-r from-blue-600 to-teal-500 text-white py-20 text-center">
        <h2 className="text-3xl font-bold mb-4">
          Empieza a organizar tus proyectos médicos con MediFlow
        </h2>
        <p className="mb-8 text-lg/7 opacity-90">Tu equipo técnico, más eficiente que nunca.</p>


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

      {/* Footer */}
      <footer className="py-6 text-center text-slate-500 text-sm">
        © {new Date().getFullYear()} MediFlow · Todos los derechos reservados
      </footer>
    </main>
  );
}
