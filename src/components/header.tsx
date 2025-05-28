'use client';

import { LogIn, UserPlus } from 'lucide-react';
import { useState } from 'react';
import SignUp from './signup';
import SignIn from './signin';

export default function Header() {
  // Removido isScrolled pois não está sendo usado
  const [showSignupModal, setShowSignupModal] = useState(false); 
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginError, setLoginError] = useState<string | undefined>(undefined);

  // Removido o efeito de scroll pois isScrolled não é utilizado

  // Removido os parâmetros não utilizados e tipagem any
  const handleLogin = async () => {
    try {
      // Sua lógica de autenticação aqui
      setLoginError(undefined);
      setShowLoginModal(false);
    } catch {
      setLoginError('Erro ao fazer login');
    }
  };

  return (
    <header className="bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Parte fixa (login/cadastro) */}
      <div className="sticky top-0 z-50 bg-gradient-to-br from-blue-50 to-indigo-100 p-2">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex justify-end">
            <div className="flex gap-4">
              <button
                className="flex items-center gap-1 text-blue-700 hover:text-blue-900 transition-colors"
                onClick={() => setShowLoginModal(true)}
              >  
                <LogIn size={20} />
                <span>Login</span>
              </button>
              <button
                className="flex items-center gap-1 text-blue-700 hover:text-blue-900 transition-colors"
                onClick={() => setShowSignupModal(true)}
              >
                <UserPlus size={20} />
                <span>Signup</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Signup */}
      <SignUp isOpen={showSignupModal} onClose={() => setShowSignupModal(false)} />

      {/* Modal de Login */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-lg p-8 shadow-lg max-w-md w-full relative">
            <button
              className="absolute top-2 right-2 text-gray-500 hover:text-gray-700"
              onClick={() => setShowLoginModal(false)}
            >
              ×
            </button>
            <SignIn onLogin={handleLogin} error={loginError} />
          </div>
        </div>
      )}
    </header>
  );
}