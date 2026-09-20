// Isolated UI fixture: localhost only, Firebase stubbed, no real user data.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const firebase = `export const auth={}, db={};
export const initializeAuthPersistence=async()=>{};
export const onAuthStateChanged=()=>()=>{};
export const signInWithEmailAndPassword=async()=>{};
export const signOut=async()=>{};
export const collection=(...args)=>args, doc=(...args)=>args;
export const serverTimestamp=()=>null;
export const onSnapshot=()=>()=>{};
export const getDocFromCache=async()=>({exists:()=>false});
export const getDocFromServer=getDocFromCache;
export const getDocs=async()=>({docs:[]});
export const getDocsFromCache=getDocs, getDocsFromServer=getDocs;
export const setDoc=async()=>{}, deleteDoc=async()=>{};
export const writeBatch=()=>({set(){},delete(){},commit:async()=>{}});`;
const fixture = `
const fixtureToday=new Date();
fixtureToday.setMinutes(fixtureToday.getMinutes()-fixtureToday.getTimezoneOffset());
localStorage.setItem('ascend:user-data:preview-fixture',JSON.stringify({settings:{bodyWeightKg:72,motion:'on'},workouts:[{id:'preview-session',date:fixtureToday.toISOString().slice(0,10),title:'Upper body · Pull',durationMin:35,bodyWeightKg:72,exercises:[{exerciseId:'seated-cable-row',restSeconds:90,sets:[{weightKg:45,reps:12},{weightKg:45,reps:10},{weightKg:45,reps:10}]}]}]}));
connectOfflineUserData({uid:'preview-fixture',email:'preview@example.test'});
showAppForUser(state.user);`;
createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://127.0.0.1');
    if(url.pathname==='/service-worker.js'){res.writeHead(404);res.end();return;}
    const file=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
    let body=await readFile(file);
    if(file.endsWith(sep+'firebase.js')) body=firebase;
    if(file.endsWith(sep+'app.js')) body=body.toString().replace('setupServiceWorker();','')+fixture;
    res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'})[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(body);
  }catch{res.writeHead(404);res.end('Not found');}
}).listen(8085,'127.0.0.1',()=>console.log('Isolated preview: http://127.0.0.1:8085'));
