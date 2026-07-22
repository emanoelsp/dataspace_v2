'use client';

import { LogIn, LogOut, User, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import SignUp from './signup';
import SignIn from './signin';
import { auth, getFirebaseErrorMessage } from '@/lib/firebase';
import { safeNextPath } from '@/lib/safe-next-path';
import { useUserProfile } from '@/lib/use-user-profile';

export default function Header() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, profile, loading } = useUserProfile()
  const [showSignupModal, setShowSignupModal] = useState(false); 
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginError, setLoginError] = useState<string | undefined>(undefined);

  useEffect(() => {
    const login = searchParams.get('login')
    if (login === '1' || login === 'true') {
      setShowLoginModal(true)
    }
  }, [searchParams])

  const handleLogin = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password)
      setLoginError(undefined);
      setShowLoginModal(false);
      const next = safeNextPath(searchParams.get('next'))
      if (next) {
        router.replace(next)
      }
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
          <div className="flex w-full items-center justify-between gap-4">
            {loading ? (
              <span className="text-sm text-blue-700">Checking session...</span>
            ) : user ? (
              <>
                <div className="flex min-w-0 flex-col items-start gap-px text-left leading-none">
                  <span className="text-sm font-medium text-blue-800 leading-none">
                    {user.displayName || user.email}
                  </span>
                  {profile && (
                    <span className="inline-block max-w-full truncate rounded-md bg-blue-100/90 px-2 py-px text-xs font-medium text-blue-800 leading-tight">
                      {profile.userType === 'datasource' ? 'Data Owner' : 'Data Client'}
                      {profile.organizationLegalName
                        ? ` · ${profile.organizationLegalName}`
                        : profile.userType === 'datasource'
                          ? ' · provider'
                          : ''}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-4 sm:gap-6">
                  <Link
                    href="/profile"
                    className="flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:text-blue-900 transition-colors"
                  >
                    <User size={18} />
                    Profile
                  </Link>
                  <button
                    type="button"
                    className="flex items-center gap-1 text-blue-700 hover:text-blue-900 transition-colors"
                    onClick={handleLogout}
                  >
                    <LogOut size={20} />
                    <span>Logout</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="ml-auto flex items-center gap-4 sm:gap-6">
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
            )}
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
