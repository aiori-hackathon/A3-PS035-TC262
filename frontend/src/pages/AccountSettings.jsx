import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../contexts/authState';
import { accountProviders, accountError, saveAccountProfile, refreshAccount, verifyEmail, resetAccountPassword, changeAccountPassword, deleteEmptyAccount } from '../services/account';
import '../styles/UserDashboard.css';
import '../styles/LiveMonitoring.css';
import '../styles/AccountSettings.css';

export default function AccountSettings() {
  const {currentUser, refreshProfile}=useAuth();
  return <AccountWorkspace key={currentUser.uid} user={currentUser} refreshProfile={refreshProfile} />;
}
function AccountWorkspace({user,refreshProfile}) {
  const navigate=useNavigate();
  const providers=accountProviders(user);
  const [name,setName]=useState(user.displayName || '');
  const [removePhoto,setRemovePhoto]=useState(false);
  const [photoFailed,setPhotoFailed]=useState(false);
  const [busy,setBusy]=useState('');
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const [current,setCurrent]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState('');
  const [deleteOpen,setDeleteOpen]=useState(false),[confirmation,setConfirmation]=useState(''),[deletePassword,setDeletePassword]=useState('');
  const [method,setMethod]=useState(providers.google?'google':'password');
  const [mailSent,setMailSent]=useState({});
  const pending=useRef(false), mounted=useRef(false), deleteField=useRef(null), deleteButton=useRef(null);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{if(deleteOpen)deleteField.current?.focus();},[deleteOpen]);
  async function act(label,operation,message) {
    if(pending.current)return;
    pending.current=true;setBusy(label);setNotice('');setError('');
    try {await operation(); if(mounted.current)setNotice(message);}
    catch(err){if(mounted.current)setError(accountError(err));}
    finally {pending.current=false;if(mounted.current){setBusy('');setCurrent('');setPassword('');setConfirm('');setDeletePassword('');}}
  }
  const avatar=user.photoURL?.startsWith('https://') && !photoFailed;
  return <div className="workspace-page live-page account-page"><header className="workspace-header"><Link className="workspace-brand" to="/dashboard">NETSCOPE.</Link><nav aria-label="Workspace"><Link to="/dashboard">Dashboard</Link><Link to="/dashboard/investigations">My Investigations</Link></nav></header>
    <main className="live-main"><p className="live-eyebrow">ACCOUNT / IDENTITY</p><h1>Account settings</h1><p>Manage the account used to access your private investigation history.</p>
      {notice && <p role="status" className="account-notice">{notice}</p>}{error && <p role="alert" className="account-error">{error}</p>}
      <section className="live-panel"><h2>Profile</h2><div className="account-avatar">{avatar?<img src={user.photoURL} alt="" referrerPolicy="no-referrer" onError={()=>setPhotoFailed(true)} />:<span aria-label="Profile initials">{(user.displayName || user.email || 'N').slice(0,1).toUpperCase()}</span>}<p>{user.email || 'Email not provided'}<br />Sign-in: {[providers.password && 'Email/password',providers.google && 'Google'].filter(Boolean).join(' + ') || 'Other provider'}</p></div>
        <form onSubmit={event=>{event.preventDefault();act('profile',async()=>{await saveAccountProfile(user,name,removePhoto);await refreshProfile();setRemovePhoto(false);},'Profile updated.');}}><label htmlFor="display-name">Display name</label><input id="display-name" value={name} maxLength={80} required autoComplete="name" onChange={event=>setName(event.target.value)} />{user.photoURL && <label className="account-check"><input type="checkbox" checked={removePhoto} onChange={event=>setRemovePhoto(event.target.checked)} />Remove current profile photo</label>}<p>Google photos are used when available; otherwise your initial is shown. Photo uploads are not supported.</p><button disabled={!!busy}>{busy==='profile'?'Saving your profile…':'Save profile'}</button></form>
      </section>
      <section className="live-panel"><h2>Email verification</h2><p>{user.emailVerified?'Email verified.':'Email has not been verified.'}</p>{!user.emailVerified && user.email && <button disabled={!!busy || mailSent.verify} onClick={()=>act('verify',async()=>{await verifyEmail(user);setMailSent(previous=>({...previous,verify:true}));},'Verification email requested. Check your inbox, then refresh verification status.')}>{mailSent.verify?'Verification requested':'Send verification email'}</button>}<button disabled={!!busy} onClick={()=>act('reload',async()=>{await refreshAccount(user);await refreshProfile();},'Account status refreshed.')}>Refresh verification status</button></section>
      <section className="live-panel"><h2>Password and sign-in</h2>{providers.password?<><p>Changing your password requires your current password. The project’s password policy also applies.</p><form onSubmit={event=>{event.preventDefault();act('password',()=>changeAccountPassword(user,current,password,confirm),'Password updated.');}}><label htmlFor="current-password">Current password</label><input id="current-password" type="password" autoComplete="current-password" value={current} onChange={event=>setCurrent(event.target.value)} required /><label htmlFor="new-password">New password</label><input id="new-password" type="password" autoComplete="new-password" value={password} minLength={6} maxLength={128} onChange={event=>setPassword(event.target.value)} required /><label htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={event=>setConfirm(event.target.value)} required /><button disabled={!!busy}>Change password</button></form><Link to="/reset-password">Forgot your current password?</Link><button disabled={!!busy || mailSent.reset} onClick={()=>act('reset',async()=>{await resetAccountPassword(user.email);setMailSent(previous=>({...previous,reset:true}));},'If this account supports password reset, an email has been requested.')}>Send password reset email</button></>:<p>You sign in through {providers.google?'Google':'an external provider'}. Manage your password with that provider. NETSCOPE does not store a separate password for this account.</p>}</section>
      <section className="live-panel account-danger"><h2>Delete account</h2><p>This permanently deletes your NETSCOPE sign-in. It does not delete your Google account. Export any reports you need, then delete saved investigations in <Link to="/dashboard/investigations">My Investigations</Link> first. Accounts with remaining workspace data cannot be deleted here.</p><p>Close other NETSCOPE tabs and stop saving new reports before continuing. Account deletion and data storage are separate operations.</p>
        {!deleteOpen?<button ref={deleteButton} disabled={!!busy || (!providers.password && !providers.google)} onClick={()=>setDeleteOpen(true)}>Review account deletion</button>:<div role="group" aria-label="Confirm account deletion"><h3>Permanently delete {user.email || 'this account'}?</h3><p>This cannot be undone. You will be asked to verify the same identity again.</p>{providers.password && providers.google && <label>Verify identity with<select value={method} onChange={event=>setMethod(event.target.value)}><option value="google">Google</option><option value="password">Current password</option></select></label>}{method==='password' && <><label htmlFor="delete-password">Current password for deletion</label><input id="delete-password" type="password" autoComplete="current-password" value={deletePassword} onChange={event=>setDeletePassword(event.target.value)} /></>}<label htmlFor="delete-confirmation">Type DELETE to confirm</label><input ref={deleteField} id="delete-confirmation" autoComplete="off" value={confirmation} onChange={event=>setConfirmation(event.target.value)} /><button disabled={!!busy || confirmation!=='DELETE' || (method==='password' && !deletePassword)} onClick={()=>act('delete',async()=>{await deleteEmptyAccount(user,{confirmation,method,password:deletePassword});navigate('/',{replace:true});},'Account deleted.')}>{busy==='delete'?'Verifying account and removing your data…':'Permanently delete account'}</button><button disabled={!!busy} onClick={()=>{setDeleteOpen(false);setConfirmation('');setDeletePassword('');requestAnimationFrame(()=>deleteButton.current?.focus());}}>Cancel deletion</button></div>}
      </section>
    </main></div>;
}
