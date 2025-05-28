"use client";

import { useState } from 'react';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { db, app } from '@/lib/firebase';
import { ToastSuccess, ToastFail } from './toast';
import { doc, setDoc } from 'firebase/firestore';

export default function SignUp({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [userType, setUserType] = useState<'datasource' | 'dataclient'>('dataclient');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showFail, setShowFail] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setShowSuccess(false);
    setShowFail(false);

    try {
      const auth = getAuth(app);
      await createUserWithEmailAndPassword(auth, email, password);
      const authUser = auth.currentUser;
      if (authUser) {
        await setDoc(doc(db, 'users', authUser.uid), {
          uid: authUser.uid,
          name,
          email,
          userType,
          createdAt: new Date().toISOString(),
        });
      }
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
      onClose(); // Fecha o modal após cadastro
    } catch (err) {
      setShowFail(true);
      setTimeout(() => setShowFail(false), 3000);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Ocorreu um erro desconhecido.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      {showSuccess && <ToastSuccess message="Cadastro realizado com sucesso!" />}
      {showFail && <ToastFail message={error || "Erro ao cadastrar usuário."} />}
      <div className="bg-white p-6 rounded-lg w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-blue-900 ">Register </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            &times;
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"
                required
                minLength={6}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">User type</label>
              <div className="mt-2 space-x-4">
                <label className="inline-flex items-center">
                  <input
                    type="radio"
                    checked={userType === 'dataclient'}
                    onChange={() => setUserType('dataclient')}
                    className="h-4 w-4 text-blue-600"
                  />
                  <span className="ml-2">Data Client</span>
                </label>
                <label className="inline-flex items-center">
                  <input
                    type="radio"
                    checked={userType === 'datasource'}
                    onChange={() => setUserType('datasource')}
                    className="h-4 w-4 text-blue-600"
                  />
                  <span className="ml-2">Data Source</span>
                </label>
              </div>
            </div>
          </div>
          <div className="mt-6">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md disabled:opacity-50"
            >
              {loading ? 'Creating account...' : 'Register'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}