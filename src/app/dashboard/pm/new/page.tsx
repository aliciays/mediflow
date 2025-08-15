'use client';
import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  doc,
  setDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { useUser } from '@/lib/useUser';

export default function NewProjectPage() {
  const { user } = useUser();
  const router = useRouter();

  // Proyecto
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [managerId, setManagerId] = useState('');
  const [status, setStatus] = useState('active');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Fase inicial
  const [phaseName, setPhaseName] = useState('');
  const [phaseDescription, setPhaseDescription] = useState('');
  const [phaseResponsibleId, setPhaseResponsibleId] = useState('');
  const [phaseStatus, setPhaseStatus] = useState('in_progress');
  const [phaseStartDate, setPhaseStartDate] = useState('');
  const [phaseEndDate, setPhaseEndDate] = useState('');

  // Listado de usuarios
  const [managers, setManagers] = useState<any[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);

  useEffect(() => {
    const fetchUsers = async () => {
      const managersSnap = await getDocs(
        query(collection(db, 'users'), where('role', '==', 'project_manager'))
      );
      setManagers(managersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

      const techSnap = await getDocs(
        query(collection(db, 'users'), where('role', '==', 'technician'))
      );
      setTechnicians(techSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    };
    fetchUsers();
  }, []);

  const handleCreate = async () => {
    if (!name.trim() || !phaseName.trim()) {
      alert('Debes indicar al menos nombre del proyecto y de la fase.');
      return;
    }

    // 1. Crear proyecto
    const projectRef = await addDoc(collection(db, 'projects'), {
      name,
      description,
      managerId,
      status,
      startDate: startDate ? Timestamp.fromDate(new Date(startDate)) : null,
      endDate: endDate ? Timestamp.fromDate(new Date(endDate)) : null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // 2. Crear fase inicial
    const phaseRef = doc(collection(db, `projects/${projectRef.id}/phases`));
    await setDoc(phaseRef, {
      name: phaseName,
      description: phaseDescription,
      responsibleId: phaseResponsibleId,
      status: phaseStatus,
      startDate: phaseStartDate ? Timestamp.fromDate(new Date(phaseStartDate)) : null,
      endDate: phaseEndDate ? Timestamp.fromDate(new Date(phaseEndDate)) : null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    router.push('/dashboard/pm');
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Crear nuevo proyecto</h1>

      {/* Datos del proyecto */}
      <div className="space-y-4 p-4 bg-white shadow rounded">
        <h2 className="font-semibold text-lg">Datos del proyecto</h2>
        <input
          type="text"
          placeholder="Nombre del proyecto"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full p-2 border rounded"
        />
        <textarea
          placeholder="Descripción del proyecto"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full p-2 border rounded"
        />
        <select
          value={managerId}
          onChange={(e) => setManagerId(e.target.value)}
          className="w-full p-2 border rounded"
        >
          <option value="">Selecciona responsable del proyecto</option>
          {managers.map(m => (
            <option key={m.id} value={m.id}>
              {m.displayName || m.email}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-full p-2 border rounded"
        >
          <option value="active">Activo</option>
          <option value="paused">Pausado</option>
          <option value="completed">Completado</option>
        </select>
        <div className="flex gap-4">
          <div className="flex-1">
            <label>Fecha inicio</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full p-2 border rounded"
            />
          </div>
          <div className="flex-1">
            <label>Fecha fin</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full p-2 border rounded"
            />
          </div>
        </div>
      </div>

      {/* Datos de la fase */}
      <div className="space-y-4 p-4 bg-white shadow rounded">
        <h2 className="font-semibold text-lg">Primera fase</h2>
        <input
          type="text"
          placeholder="Nombre de la fase"
          value={phaseName}
          onChange={(e) => setPhaseName(e.target.value)}
          className="w-full p-2 border rounded"
        />
        <textarea
          placeholder="Descripción de la fase"
          value={phaseDescription}
          onChange={(e) => setPhaseDescription(e.target.value)}
          className="w-full p-2 border rounded"
        />
        <select
          value={phaseResponsibleId}
          onChange={(e) => setPhaseResponsibleId(e.target.value)}
          className="w-full p-2 border rounded"
        >
          <option value="">Selecciona responsable de la fase</option>
          {managers.concat(technicians).map(m => (
            <option key={m.id} value={m.id}>
              {m.displayName || m.email}
            </option>
          ))}
        </select>
        <select
          value={phaseStatus}
          onChange={(e) => setPhaseStatus(e.target.value)}
          className="w-full p-2 border rounded"
        >
          <option value="not_started">No iniciada</option>
          <option value="in_progress">En progreso</option>
          <option value="completed">Completada</option>
        </select>
        <div className="flex gap-4">
          <div className="flex-1">
            <label>Fecha inicio</label>
            <input
              type="date"
              value={phaseStartDate}
              onChange={(e) => setPhaseStartDate(e.target.value)}
              className="w-full p-2 border rounded"
            />
          </div>
          <div className="flex-1">
            <label>Fecha fin</label>
            <input
              type="date"
              value={phaseEndDate}
              onChange={(e) => setPhaseEndDate(e.target.value)}
              className="w-full p-2 border rounded"
            />
          </div>
        </div>
      </div>

      <button
        onClick={handleCreate}
        className="px-4 py-2 bg-green-500 text-white rounded"
      >
        Crear proyecto
      </button>
    </div>
  );
}
