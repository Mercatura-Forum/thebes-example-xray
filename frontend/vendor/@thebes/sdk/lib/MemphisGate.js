import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * MemphisGate — open-demo wrapper with Memphis passkey sign-in on demand.
 *
 * This is a public demo: anyone can roam the app without signing in. Memphis
 * passkey sign-in is offered in the header (SignOutChip) and prompted only when
 * a visitor wants a persistent human identity. Sign-in attaches a display name;
 * the on-chain caller is the boundary's persisted browser key either way, so
 * reads and role-gated writes resolve against the same identity for guests and
 * signed-in users alike. Same API as every other Thebes example (wrap routes in
 * <MemphisGate>, read the session via useAuth(), sign in / out via SignOutChip);
 * the dark reading-room styling is the only thing specific to Lumen.
 */
import { createContext, useContext, useState } from 'react';
import { useMemphis } from './useMemphis.js';
const AuthCtx = createContext(null);
/** The Memphis session (signed in or guest). Throws if used outside the gate. */
export function useAuth() {
    const v = useContext(AuthCtx);
    if (!v)
        throw new Error('useAuth must be used inside <MemphisGate>');
    return v;
}
/** Open demo: always render the app. Sign-in is on demand via SignOutChip.
 *  appName/tagline are accepted for API parity with the gated form but are not
 *  used here — the front door is open. */
export function MemphisGate({ children }) {
    const auth = useMemphis();
    return _jsx(AuthCtx.Provider, { value: auth, children: children });
}
/**
 * Header auth control. Guests see a "Sign in" affordance that expands into a
 * name + passkey prompt; signed-in users see their name and a sign-out link.
 * Styled for Lumen's dark reading room (cyan --color-act accent).
 */
export function SignOutChip({ className = '' }) {
    const auth = useAuth();
    const [name, setName] = useState('');
    const [open, setOpen] = useState(false);
    if (auth.signedIn)
        return (_jsxs("span", { className: `inline-flex items-center gap-2 text-xs ${className}`, children: [_jsx("span", { className: "text-ink-soft", children: auth.displayName }), _jsx("button", { className: "rounded-md px-2 py-1 font-medium text-[var(--color-act)] hover:brightness-110", onClick: auth.signOut, children: "Sign out" })] }));
    // Memphis handles look like  <stem>.thebes  — we append ".thebes" so a visitor
    // only types the stem (3–32 chars, a–z 0–9 -). No bare fallback: an invalid
    // stem keeps the button disabled instead of failing with a cryptic error.
    const stem = name.trim().toLowerCase().replace(/\.thebes$/, '');
    const stemOk = stem.length >= 3 && stem.length <= 32 && /^[a-z0-9-]+$/.test(stem) && !stem.startsWith('-') && !stem.endsWith('-');
    const handle = `${stem}.thebes`;
    const submit = () => { if (stemOk && !auth.busy)
        auth.signIn(handle).catch(() => { }); };
    if (!open)
        return (_jsx("button", { className: `rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--color-act)] ring-1 ring-[var(--color-act)]/40 hover:bg-[var(--color-act)]/10 ${className}`, onClick: () => setOpen(true), children: "Sign in" }));
    return (_jsxs("span", { className: `inline-flex flex-col items-stretch gap-1 ${className}`, children: [_jsxs("span", { className: "inline-flex items-center gap-2", children: [_jsx("input", { className: "rounded-lg bg-black/30 px-2.5 py-1.5 text-xs text-ink ring-1 ring-[var(--color-act)]/30 outline-none focus:ring-[var(--color-act)]", placeholder: "yourname", value: name, autoFocus: true, "aria-label": "Thebes handle", onChange: (e) => setName(e.target.value), onKeyDown: (e) => e.key === 'Enter' && submit() }), _jsx("button", { className: "rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--color-act-ink)] transition hover:brightness-110 disabled:opacity-50", style: { background: 'var(--color-act)' }, onClick: submit, disabled: auth.busy || !stemOk, children: auth.busy ? 'Signing in…' : 'Sign in with passkey' })] }), _jsxs("span", { style: { fontSize: '11px', opacity: 0.7 }, children: [stem ? _jsxs(_Fragment, { children: ["\u2192 becomes ", _jsx("b", { children: handle })] }) : 'pick a handle — we add .thebes', " \u00B7 3\u201332 \u00B7 a\u2013z 0\u20139 -"] }), auth.error && _jsx("span", { className: "rounded-md bg-red-500/15 px-2 py-1 text-xs text-red-300", children: auth.error })] }));
}
