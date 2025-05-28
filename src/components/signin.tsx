'use client'

import React, { useState } from "react";

interface LoginProps {
    onLogin: (email: string, password: string) => void;
    error?: string;
}

const SignIn: React.FC<LoginProps> = ({ onLogin, error }) => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await onLogin(email, password);
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            <h2 className="text-2xl font-bold text-blue-900">Login </h2>
            {error && <div style={{ color: "red" }}>{error}</div>}
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
                <label className="mt-4 block text-sm font-medium text-gray-700">Senha</label>
                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border"
                    required
                    minLength={6}
                />
            </div>
                <button
                    type="submit"
                    disabled={loading}
                    className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md disabled:opacity-50"
                >
                    {loading ? 'Logging in...' : 'Login'}
                </button>
        </form>
    );
};

export default SignIn;