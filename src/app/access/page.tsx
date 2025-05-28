'use client';
import { useState } from 'react';

export default function AccessPage() {
  const [assetId, setAssetId] = useState('');
  const [userId, setUserId] = useState('');
  const [purpose, setPurpose] = useState('');

  const requestAccess = async () => {
    await fetch('/api/access-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetId, userId, purpose }),
    });
    setAssetId('');
    setUserId('');
    setPurpose('');
  };

  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Solicitar Acesso</h1>
      <input value={assetId} onChange={(e) => setAssetId(e.target.value)} placeholder="Asset ID" className="border p-2 w-full mb-2" />
      <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="User ID" className="border p-2 w-full mb-2" />
      <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Motivo do Acesso" className="border p-2 w-full mb-2" />
      <button onClick={requestAccess} className="bg-blue-600 text-white px-4 py-2">Solicitar</button>
    </div>
  );
}