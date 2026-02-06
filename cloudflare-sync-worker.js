/**
 * Cloudflare Worker (D1) for Alyaqubi PWA cloud sync + user tokens.
 *
 * Bindings:
 *  - DB (D1 database)
 *  - ALLOWED_ORIGINS (optional, comma-separated)
 *
 * Routes:
 *  GET  /health
 *  GET  /auth/whoami
 *  POST /sync/push
 *  GET  /sync/pull?since=<cursor>
 *
 * Admin (role=admin):
 *  POST /admin/users/create   {name, role}
 *  GET  /admin/users/list
 *  POST /admin/users/revoke   {userId}
 */

const json = (obj, status=200, headers={})=> new Response(JSON.stringify(obj), {
  status,
  headers: {
    'content-type':'application/json; charset=utf-8',
    ...headers
  }
});

const text = (t, status=200, headers={})=> new Response(t, { status, headers });

function corsHeaders(req, env){
  const origin = req.headers.get('Origin') || '*';
  const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map(s=>s.trim()).filter(Boolean);
  const ok = allowed.includes('*') || allowed.includes(origin);
  return {
    'access-control-allow-origin': ok ? origin : (allowed[0] || '*'),
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
    'access-control-allow-credentials': 'true',
    'vary': 'Origin'
  };
}

async function sha256Hex(str){
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  const bytes = new Uint8Array(buf);
  return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
}

function bearerToken(req){
  const h = req.headers.get('Authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

async function auth(req, env){
  const token = bearerToken(req);
  if(!token) return { ok:false, status:401, error:'missing_token' };

  const hash = await sha256Hex(token);
  const row = await env.DB.prepare(
    'SELECT id,name,role,active,created_at FROM users WHERE token_hash = ? LIMIT 1'
  ).bind(hash).first();

  if(!row || row.active !== 1) return { ok:false, status:403, error:'invalid_token' };
  return { ok:true, user: { id: row.id, name: row.name, role: row.role, created_at: row.created_at } };
}

function isAllowed(role, kind){
  // staff: logs + student CRUD (individual)
  // admin: everything
  if(role === 'admin') return true;
  const allow = new Set([
    'log.add',
    'student.upsert',
    'student.delete'
  ]);
  return allow.has(kind);
}

export default {
  async fetch(req, env){
    const url = new URL(req.url);

    // CORS preflight
    if(req.method === 'OPTIONS'){
      return new Response(null, { status: 204, headers: corsHeaders(req, env) });
    }

    try{
      if(url.pathname === '/health'){
        return json({ ok:true, service:'alyaqubi-sync' }, 200, corsHeaders(req, env));
      }

      if(url.pathname === '/auth/whoami'){
        const a = await auth(req, env);
        if(!a.ok) return json({ ok:false, error:a.error }, a.status, corsHeaders(req, env));
        return json({ ok:true, user:a.user }, 200, corsHeaders(req, env));
      }

      if(url.pathname === '/sync/push'){
        if(req.method !== 'POST') return json({ ok:false, error:'method_not_allowed' }, 405, corsHeaders(req, env));
        const a = await auth(req, env);
        if(!a.ok) return json({ ok:false, error:a.error }, a.status, corsHeaders(req, env));

        const body = await req.json().catch(()=>null);
        const ops = Array.isArray(body?.ops) ? body.ops : [];
        if(!ops.length) return json({ ok:true, accepted:0 }, 200, corsHeaders(req, env));

        let accepted = 0;
        let rejected = 0;

        // Insert ops idempotently; use seq autoincrement
        const stmts = [];
        for(const op of ops){
          if(!op || typeof op.id !== 'string' || !op.kind) { rejected++; continue; }
          const kind = String(op.kind);
          if(!isAllowed(a.user.role, kind)){ rejected++; continue; }

          const at = op.at || new Date().toISOString();
          const payload = JSON.stringify(op.payload ?? null);
          const deviceId = String(op.deviceId || '');

          stmts.push(
            env.DB.prepare(
              `INSERT OR IGNORE INTO ops (id, at, kind, payload, device_id, user_id)
               VALUES (?, ?, ?, ?, ?, ?)`
            ).bind(op.id, at, kind, payload, deviceId, a.user.id)
          );
        }

        if(stmts.length){
          const res = await env.DB.batch(stmts);
          // Count accepted approximately: changes count per statement
          for(const r of res){ if(r.success && (r.meta?.changes||0) > 0) accepted++; }
        }

        return json({ ok:true, accepted, rejected }, 200, corsHeaders(req, env));
      }

      if(url.pathname === '/sync/pull'){
        if(req.method !== 'GET') return json({ ok:false, error:'method_not_allowed' }, 405, corsHeaders(req, env));
        const a = await auth(req, env);
        if(!a.ok) return json({ ok:false, error:a.error }, a.status, corsHeaders(req, env));

        const since = Number(url.searchParams.get('since') || 0);
        const limit = Math.min(800, Math.max(1, Number(url.searchParams.get('limit') || 400)));

        const rows = await env.DB.prepare(
          `SELECT seq,id,at,kind,payload,device_id as deviceId,user_id as userId
           FROM ops WHERE seq > ? ORDER BY seq ASC LIMIT ?`
        ).bind(since, limit).all();

        const ops = (rows.results || []).map(r=>({
          seq: r.seq,
          id: r.id,
          at: r.at,
          kind: r.kind,
          payload: JSON.parse(r.payload || 'null'),
          deviceId: r.deviceId,
          userId: r.userId
        }));

        const cursor = ops.length ? ops[ops.length-1].seq : since;
        return json({ ok:true, cursor, ops }, 200, corsHeaders(req, env));
      }

      // --- Admin APIs
      if(url.pathname === '/admin/users/create'){
        if(req.method !== 'POST') return json({ ok:false, error:'method_not_allowed' }, 405, corsHeaders(req, env));
        const a = await auth(req, env);
        if(!a.ok) return json({ ok:false, error:a.error }, a.status, corsHeaders(req, env));
        if(a.user.role !== 'admin') return json({ ok:false, error:'forbidden' }, 403, corsHeaders(req, env));

        const body = await req.json().catch(()=>null);
        const name = String(body?.name || '').trim();
        const role = String(body?.role || 'staff').trim();
        if(!name) return json({ ok:false, error:'missing_name' }, 400, corsHeaders(req, env));
        if(!['staff','admin'].includes(role)) return json({ ok:false, error:'invalid_role' }, 400, corsHeaders(req, env));

        const token = `yaq_${crypto.randomUUID().replace(/-/g,'')}`;
        const tokenHash = await sha256Hex(token);
        const createdAt = new Date().toISOString();

        const ins = await env.DB.prepare(
          'INSERT INTO users (name, role, token_hash, active, created_at) VALUES (?, ?, ?, 1, ?)'
        ).bind(name, role, tokenHash, createdAt).run();

        return json({ ok:true, token, user:{ id: ins.meta.last_row_id, name, role, created_at: createdAt } }, 200, corsHeaders(req, env));
      }

      if(url.pathname === '/admin/users/list'){
        if(req.method !== 'GET') return json({ ok:false, error:'method_not_allowed' }, 405, corsHeaders(req, env));
        const a = await auth(req, env);
        if(!a.ok) return json({ ok:false, error:a.error }, a.status, corsHeaders(req, env));
        if(a.user.role !== 'admin') return json({ ok:false, error:'forbidden' }, 403, corsHeaders(req, env));

        const rows = await env.DB.prepare(
          'SELECT id,name,role,active,created_at FROM users ORDER BY id DESC LIMIT 200'
        ).all();
        return json({ ok:true, users: rows.results || [] }, 200, corsHeaders(req, env));
      }

      if(url.pathname === '/admin/users/revoke'){
        if(req.method !== 'POST') return json({ ok:false, error:'method_not_allowed' }, 405, corsHeaders(req, env));
        const a = await auth(req, env);
        if(!a.ok) return json({ ok:false, error:a.error }, a.status, corsHeaders(req, env));
        if(a.user.role !== 'admin') return json({ ok:false, error:'forbidden' }, 403, corsHeaders(req, env));

        const body = await req.json().catch(()=>null);
        const userId = Number(body?.userId);
        if(!userId) return json({ ok:false, error:'missing_userId' }, 400, corsHeaders(req, env));

        await env.DB.prepare('UPDATE users SET active=0 WHERE id=?').bind(userId).run();
        return json({ ok:true }, 200, corsHeaders(req, env));
      }

      return json({ ok:false, error:'not_found' }, 404, corsHeaders(req, env));

    }catch(err){
      return json({ ok:false, error:'server_error', message: (err && err.message) ? err.message : String(err) }, 500, corsHeaders(req, env));
    }
  }
};
