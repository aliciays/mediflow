'use client'

import { useRouter } from 'next/navigation'
import { useUser } from '@/lib/useUser'
import { useEffect } from 'react'

export default function DashboardPage() {
  const { user, loading } = useUser()
  const router = useRouter()

  // Redirigir al login si no está autenticado
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [loading, user, router])

  if (loading || !user) {
    return <p className="p-4">Cargando...</p>
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">¡Bienvenida, {user.email}!</h1>
      <p className="mt-2 text-gray-600">
        Este es tu dashboard. Desde aquí podrás gestionar tus proyectos.
      </p>
    </div>
  )
}
