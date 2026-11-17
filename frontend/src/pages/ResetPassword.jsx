import {useRef,useState} from 'react';
import {Link,useLocation} from 'react-router';
import {resetAccountPassword,accountError} from '../services/account';
export default function ResetPassword() {
 const location=useLocation();
 const [email,setEmail]=useState(''),[busy,setBusy]=useState(false),[sent,setSent]=useState(false),[error,setError]=useState('');const pending=useRef(false);
 async function submit(event){event.preventDefault();if(pending.current)return;pending.current=true;setBusy(true);setError('');try{await resetAccountPassword(email);setSent(true);}catch(err){setError(accountError(err));}finally{pending.current=false;setBusy(false);}}
 return <main className="auth-page"><div className="auth-container"><Link className="auth-logo" to="/">NETSCOPE.</Link><section className="auth-card"><h1>Reset your password</h1><p>For email/password accounts. If you use Google sign-in, continue with Google on the login page.</p><form onSubmit={submit}><label htmlFor="reset-email">Email address</label><input id="reset-email" type="email" autoComplete="email" value={email} onChange={event=>{setEmail(event.target.value);setSent(false);}} required maxLength={254} /><button className="auth-submit-button" disabled={busy || sent}>{busy?'Sending your reset link…':'Request reset email'}</button></form>{sent && <p role="status">If this address has an eligible account, a password reset email has been requested. Check your inbox and spam folder.</p>}{error && <p className="auth-error" role="alert">{error}</p>}<p><Link to="/login" state={location.state}>Back to login</Link></p></section></div></main>;
}
