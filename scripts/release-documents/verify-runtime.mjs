// Authenticated read-only acceptance; JWT and secrets stay in this process memory.
import {readFileSync} from 'node:fs';
import {assertRuntimeOptions} from './runtime-acceptance.mjs';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {createHmac} from 'node:crypto';
import path from 'node:path';
const config=JSON.parse(readFileSync(process.argv[2],'utf8'));
const require=createRequire(path.join(config.appRoot,'server/package.json'));
const dotenv=require('dotenv');
let secret='';
try {
 const environment=readFileSync(`/proc/${config.apiPid}/environ`,'utf8');
 secret=environment.split('\0').find(item=>item.startsWith('JWT_SECRET='))?.slice(11)||'';
}catch{}
if(!secret)secret=dotenv.parse(readFileSync(path.join(config.appRoot,'server/.env'))).JWT_SECRET||'';
if(secret.length<32)throw new Error('ACTIVE_JWT_SECRET_UNAVAILABLE');
const db=new DatabaseSync(config.database,{readOnly:true});
try {
 const user=db.prepare('SELECT id,role,disabled_at,password_changed_at FROM users WHERE id=?').get(config.adminId);
 if(user?.role!=='admin'||user.disabled_at!=='')throw new Error('ACTIVE_ADMIN_REQUIRED');
 const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
 const time=Math.floor(Date.now()/1000);
 const unsigned=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:user.id,role:user.role,sessionEpoch:String(user.password_changed_at||''),iss:'clover-server',aud:'clover-app',iat:time,exp:time+10});
 let token=unsigned+'.'+createHmac('sha256',secret).update(unsigned).digest('base64url');secret='';
 const response=await fetch('http://127.0.0.1:4100/api/documents/admin/generator/options',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(8000)});token='';
 if(response.status!==200)throw new Error('DOCUMENT_OPTIONS_HTTP_FAILED');
 const options=await response.json();
 assertRuntimeOptions(options,config.expectAI);
 if(db.prepare('SELECT COUNT(*) AS n FROM document_template_versions').get().n!==8)throw new Error('EIGHT_TEMPLATES_REQUIRED');
 const seq=db.prepare("SELECT next_number,prefix,suffix FROM document_sequences WHERE name='contracts'").get();
 if(seq?.next_number!==255||seq.prefix!=='1-636/'||seq.suffix!=='')throw new Error('SEQUENCE_ACCEPTANCE_FAILED');
 if(db.prepare('SELECT COUNT(*) AS n FROM documents').get().n!==0)throw new Error('BUSINESS_WRITES_ALREADY_PRESENT');
 console.log('PASS authenticated module/options/FNS advisory/two entities/eight templates/unused sequence; no paid AI or business writes');
}finally{secret='';db.close();}
