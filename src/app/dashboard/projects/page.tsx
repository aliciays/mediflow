'use client'

import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { db } from '@/lib/firebase'
import { collection, addDoc, Timestamp } from 'firebase/firestore'
import { useUser } from '@/lib/useUser'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

const schema = z.object({
  name: z.string().min(3, 'El nombre es obligatorio'),
  description: z.string().min(5, 'Añade una descripción'),
})

type FormData = z.infer<typeof schema>

export default function ProjectsPage() {
  const { user, loading } = useUser()
  const router = useRouter()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    console.log('User desde useUser():', user)
  }, [user])

  const onSubmit = async (data: FormData) => {
    console.log('➡️ onSubmit ejecutado con:', data)

    if (!user) {
      console.log('🚫 No hay usuario autenticado, cancelando submit')
      return
    }

    try {
      await addDoc(collection(db, 'projects'), {
        ...data,
        ownerId: user.uid,
        createdAt: Timestamp.now(),
      })

      alert('✅ Proyecto creado correctamente')
      reset()
      router.push('/dashboard')
    } catch (err) {
      console.error('Error al guardar en Firestore:', err)
    }
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f9fafb', padding: '2rem' }}>
      <div style={{ width: '100%', maxWidth: '500px', background: 'white', padding: '2rem', borderRadius: '8px', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '1.5rem', textAlign: 'center' }}>Nuevo Proyecto</h1>

        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Nombre del proyecto</label>
            <input
              type="text"
              {...register('name')}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px' }}
            />
            {errors.name && <p style={{ color: 'red', fontSize: '12px' }}>{errors.name.message}</p>}
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Descripción</label>
            <textarea
              {...register('description')}
              rows={3}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px' }}
            />
            {errors.description && <p style={{ color: 'red', fontSize: '12px' }}>{errors.description.message}</p>}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            onClick={() => console.log('🖱️ Botón clicado')}
            style={{
              width: '100%',
              padding: '0.75rem',
              backgroundColor: '#0284c7',
              color: 'white',
              fontWeight: 'bold',
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
              opacity: isSubmitting ? 0.7 : 1,
            }}
          >
            {isSubmitting ? 'Guardando...' : 'Crear proyecto'}
          </button>
        </form>
      </div>
    </main>
  )
}
