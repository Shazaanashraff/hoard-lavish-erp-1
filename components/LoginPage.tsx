import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../context/StoreContext';
import { AlertCircle, Loader2 } from 'lucide-react';
import { User } from '../types';

const DIAL_RADIUS = 100;
const DIAL_CIRCUMFERENCE = 2 * Math.PI * DIAL_RADIUS;
const TICK_COUNT = 40;
const DIAL_TICKS = Array.from({ length: TICK_COUNT }, (_, i) => {
    const angle = (i / TICK_COUNT) * 2 * Math.PI;
    const outer = DIAL_RADIUS - 8;
    const inner = i % 5 === 0 ? outer - 8 : outer - 4;
    return {
        x1: 110 + outer * Math.cos(angle),
        y1: 110 + outer * Math.sin(angle),
        x2: 110 + inner * Math.cos(angle),
        y2: 110 + inner * Math.sin(angle),
    };
});

const UNLOCK_STATUSES = ['Verifying PIN…', "Loading today's catalog…", 'Preparing terminal…'];

const LoginPage: React.FC = () => {
    const { users, login, isLoading } = useStore();
    const [pin, setPin] = useState('');
    const [error, setError] = useState(false);
    const [shake, setShake] = useState(false);
    const [unlocking, setUnlocking] = useState(false);
    const [matchedUser, setMatchedUser] = useState<User | null>(null);
    const [statusIndex, setStatusIndex] = useState(0);
    const timers = useRef<number[]>([]);

    useEffect(() => () => timers.current.forEach(clearTimeout), []);

    const attemptLogin = (pinCode: string) => {
        const user = users.find(u => u.pin === pinCode);
        if (user) {
            setMatchedUser(user);
            setUnlocking(true);
            setStatusIndex(0);
            UNLOCK_STATUSES.forEach((_, i) => {
                if (i === 0) return;
                timers.current.push(window.setTimeout(() => setStatusIndex(i), i * 650));
            });
            timers.current.push(window.setTimeout(() => login(user), 1900));
        } else {
            setError(true);
            setShake(true);
            timers.current.push(window.setTimeout(() => {
                setShake(false);
                setPin('');
            }, 420));
        }
    };

    const handlePinInput = (digit: string) => {
        if (unlocking || pin.length >= 4) return;
        const newPin = pin + digit;
        setPin(newPin);
        setError(false);
        if (newPin.length === 4) {
            window.setTimeout(() => attemptLogin(newPin), 150);
        }
    };

    const handleBackspace = () => {
        if (unlocking) return;
        setPin(prev => prev.slice(0, -1));
        setError(false);
    };

    const handleClear = () => {
        if (unlocking) return;
        setPin('');
        setError(false);
    };

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (/^[0-9]$/.test(e.key)) handlePinInput(e.key);
            if (e.key === 'Backspace') handleBackspace();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    });

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#F7F3EA] flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="w-9 h-9 text-[#C9922B] animate-spin mx-auto mb-4" />
                    <p className="text-[#8B8371] text-sm">Loading…</p>
                </div>
            </div>
        );
    }

    const dialFraction = pin.length / 4;
    const dialColor = error ? '#C25A4E' : '#C9922B';

    return (
        <div className="min-h-screen bg-[radial-gradient(ellipse_at_50%_-10%,#FFFDF8_0%,#F7F3EA_60%)] flex items-center justify-center p-4 overflow-hidden">
            {/* PIN Entry */}
            <div
                className={`flex flex-col items-center transition-all duration-500 ${unlocking ? 'opacity-0 scale-[0.98] pointer-events-none absolute' : 'opacity-100'}`}
            >
                <h1 className="font-['Fraunces'] font-semibold text-[26px] tracking-tight text-[#1B1F27] mb-0.5">
                    HOARD <span className="italic font-normal text-[#A9781F]">Lavish</span>
                </h1>
                <p className="text-[11px] tracking-[0.28em] uppercase text-[#8B8371] mb-11">Terminal Access</p>

                {/* Vault Dial */}
                <div className={`relative w-[220px] h-[220px] mb-8 ${shake ? 'animate-[shake_0.4s_ease]' : ''}`}>
                    <svg viewBox="0 0 220 220" className="absolute inset-0 -rotate-90">
                        <circle cx="110" cy="110" r={DIAL_RADIUS} fill="none" stroke="#E5DCC8" strokeWidth={1.5} />
                        {DIAL_TICKS.map((t, i) => (
                            <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="#E5DCC8" strokeWidth={2} />
                        ))}
                        <circle
                            cx="110" cy="110" r={DIAL_RADIUS}
                            fill="none"
                            stroke={dialColor}
                            strokeWidth={3}
                            strokeLinecap="round"
                            strokeDasharray={`${dialFraction * DIAL_CIRCUMFERENCE} ${DIAL_CIRCUMFERENCE}`}
                            style={{
                                transition: 'stroke-dasharray 0.5s cubic-bezier(.65,0,.35,1), stroke 0.3s ease',
                                filter: `drop-shadow(0 0 5px ${error ? 'rgba(194,90,78,.4)' : 'rgba(169,120,31,.35)'})`,
                            }}
                        />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3.5">
                        <div className="flex gap-3.5">
                            {[0, 1, 2, 3].map(i => (
                                <div
                                    key={i}
                                    className="w-[11px] h-[11px] rounded-full transition-all duration-200"
                                    style={{
                                        background: i < pin.length ? dialColor : '#E5DCC8',
                                        transform: i < pin.length ? 'scale(1.15)' : 'scale(1)',
                                        boxShadow: i < pin.length ? `0 0 8px ${error ? 'rgba(194,90,78,.45)' : 'rgba(201,146,43,.45)'}` : 'none',
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                <div className={`h-4 mb-5 flex items-center gap-1.5 text-[11px] tracking-wider uppercase text-[#C25A4E] transition-opacity duration-200 ${error ? 'opacity-100' : 'opacity-0'}`}>
                    <AlertCircle size={13} />
                    Incorrect PIN
                </div>

                {/* Keypad */}
                <div className="grid grid-cols-3 gap-3">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                        <button
                            key={num}
                            onClick={() => handlePinInput(String(num))}
                            className="w-[60px] h-[60px] rounded-full bg-white border border-[#E5DCC8] text-[#1B1F27] text-lg font-medium shadow-[0_1px_2px_rgba(27,31,39,0.04)] hover:bg-[#FBF8F1] hover:border-[#D8CBA8] active:scale-[0.94] transition-all"
                        >
                            {num}
                        </button>
                    ))}
                    <button
                        onClick={handleClear}
                        className="w-[60px] h-[60px] rounded-full text-[11px] tracking-wider font-medium text-[#8B8371] hover:text-[#1B1F27] transition-colors"
                    >
                        CLR
                    </button>
                    <button
                        onClick={() => handlePinInput('0')}
                        className="w-[60px] h-[60px] rounded-full bg-white border border-[#E5DCC8] text-[#1B1F27] text-lg font-medium shadow-[0_1px_2px_rgba(27,31,39,0.04)] hover:bg-[#FBF8F1] hover:border-[#D8CBA8] active:scale-[0.94] transition-all"
                    >
                        0
                    </button>
                    <button
                        onClick={handleBackspace}
                        className="w-[60px] h-[60px] rounded-full text-[15px] font-medium text-[#8B8371] hover:text-[#1B1F27] transition-colors"
                    >
                        ⌫
                    </button>
                </div>

                <p className="absolute -bottom-14 text-[10px] tracking-[0.14em] uppercase text-[#B8AF98]">
                    Secured POS Terminal · v{__APP_VERSION__}
                </p>
            </div>

            {/* Unlocking */}
            <div className={`flex flex-col items-center transition-opacity duration-500 ${unlocking ? 'opacity-100' : 'opacity-0 pointer-events-none absolute'}`}>
                <div className="relative w-24 h-24 mb-7">
                    <svg viewBox="0 0 96 96" className="w-full h-full animate-spin" style={{ animationDuration: '1.6s' }}>
                        <circle cx="48" cy="48" r="42" fill="none" stroke="#E5DCC8" strokeWidth={2} />
                        <circle cx="48" cy="48" r="42" fill="none" stroke="#C9922B" strokeWidth={2.5} strokeLinecap="round" strokeDasharray="70 300" />
                    </svg>
                </div>
                <p className="font-['Fraunces'] font-semibold text-[17px] text-[#1B1F27] mb-2">
                    {matchedUser ? `Welcome, ${matchedUser.name.split(' ')[0]}` : 'Unlocking'}
                </p>
                <p className="text-[11px] tracking-[0.1em] uppercase text-[#8B8371] transition-opacity duration-200">
                    {UNLOCK_STATUSES[statusIndex]}
                </p>
            </div>
        </div>
    );
};

export default LoginPage;
