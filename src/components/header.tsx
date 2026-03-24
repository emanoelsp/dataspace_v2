'use client';

import { LogIn, LogOut, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import SignUp from './signup';
import SignIn from './signin';
import { auth, getFirebaseErrorMessage } from '@/lib/firebase';
import { useUserProfile } from '@/lib/use-user-profile';

export default function Header() {
  const { user, profile, loading } = useUserProfile()
  const [showSignupModal, setShowSignupModal] = useState(false); 
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginError, setLoginError] = useState<string | undefined>(undefined);

  const handleLogin = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password)
      setLoginError(undefined);
      setShowLoginModal(false);
    } catch (error) {
      setLoginError(getFirebaseErrorMessage(error));
    }
  };

  const handleLogout = async () => {
    await signOut(auth)
    setLoginError(undefined)
    setShowLoginModal(false)
    setShowSignupModal(false)
  }

  return (
    <header className="bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Parte fixa (login/cadastro) */}
      <div className="sticky top-0 z-50 bg-gradient-to-br from-blue-50 to-indigo-100 p-2">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex justify-end">
            <div className="flex gap-4">
              {loading ? (
                <span className="text-sm text-blue-700">Checking session...</span>
              ) : user ? (
                <>
                  <span className="flex flex-col sm:flex-row sm:items-center sm:gap-2 text-sm font-medium text-blue-800 text-right sm:text-left">
                    <span>{user.displayName || user.email}</span>
                    {profile && (
                      <span className="text-xs font-normal text-blue-700/90">
                        {profile.userType === 'datasource' ? 'Data Owner' : 'Data Client'}
                        {profile.organizationLegalName
                          ? ` · ${profile.organizationLegalName}`
                          : profile.userType === 'datasource'
                            ? ' · provider'
                            : ''}
                      </span>
                    )}
                  </span>
                  <button
                    className="flex items-center gap-1 text-blue-700 hover:text-blue-900 transition-colors"
                    onClick={handleLogout}
                  >
                    <LogOut size={20} />
                    <span>Logout</span>
                  </button>
                </>
              ) : (
                <>
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
                </>
              )}
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
