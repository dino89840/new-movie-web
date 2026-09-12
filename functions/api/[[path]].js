const SESSION_COOKIE = "__Host-cmflix_session";
const encoder = new TextEncoder();

const rateStore = new Map();

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, "");
  const method = request.method.toUpperCase();

  try {
    if (method === "OPTIONS") {
      return new Response(null, { status: 204 });
    }

    if (path === "status" && method === "GET") {
      return getStatus(env);
    }
    if (path === "bootstrap" && method === "GET") {
  return bootstrap(request, env);
}

    if (path === "setup" && method === "POST") {
      return setupAdmin(request, env);
    }

    if (path === "auth/register" && method === "POST") {
      return register(request, env);
    }

    if (path === "auth/login" && method === "POST") {
      return login(request, env);
    }

    if (path === "auth/logout" && method === "POST") {
      return logout(request, env);
    }

    if (path === "auth/me" && method === "GET") {
      return me(request, env);
    }

    if (path === "account/password" && method === "POST") {
      return changePassword(request, env);
    }

    if (path === "play" && method === "POST") {
      return protectedPlayback(request, env);
    }

    if (path === "download" && method === "POST") {
      return protectedDownload(request, env);
    }

    const maintenance = await getSetting(env, "maintenance_mode", "0");
    const isAdminRoute = path.startsWith("admin/");

    if (maintenance === "1" && !isAdminRoute) {
      const auth = await getAuth(request, env);

      if (!auth || auth.user.role !== "admin") {
        return json(
          {
            error: "maintenance",
            message: await getSetting(
              env,
              "maintenance_message",
              "CMFLIX ကို ခေတ္တပြုပြင်နေပါသည်။"
            )
          },
          503
        );
      }
    }

    if (path === "titles" && method === "GET") {
      return publicTitles(request, env, context);
    }

    if (path.startsWith("titles/") && method === "GET") {
      const slug = decodeURIComponent(path.slice("titles/".length));
      return publicTitle(request, env, slug, context);
    }

    if (path === "favorites" && method === "GET") {
      return listFavorites(request, env);
    }

    if (path.startsWith("favorites/") && method === "POST") {
      return addFavorite(
        request,
        env,
        decodeURIComponent(path.slice("favorites/".length))
      );
    }

    if (path.startsWith("favorites/") && method === "DELETE") {
      return removeFavorite(
        request,
        env,
        decodeURIComponent(path.slice("favorites/".length))
      );
    }

    if (path === "admin/vip-users" && method === "GET") {
      return adminSearchVipUsers(request, env);
    }

    const vipUserMatch =
      path.match(/^admin\/vip-users\/([^/]+)\/(extend|reset-device|cancel)$/);

    if (vipUserMatch && method === "POST") {
      const userId = decodeURIComponent(vipUserMatch[1]);
      const action = vipUserMatch[2];

      if (action === "extend") {
        return adminExtendVip(request, env, userId);
      }

      if (action === "reset-device") {
        return adminResetVipDevice(request, env, userId);
      }

      if (action === "cancel") {
        return adminCancelVip(request, env, userId);
      }
    }

    if (path === "admin/tmdb/search" && method === "GET") {
      return tmdbSearch(request, env);
    }

    if (path === "admin/titles" && method === "GET") {
      return adminTitles(request, env);
    }

    if (path === "admin/titles" && method === "POST") {
      return adminCreateTitle(request, env);
    }

    if (path === "admin/titles/publish-all" && method === "POST") {
      return adminPublishAll(request, env);
    }

    if (path === "admin/downloads" && method === "GET") {
      return adminListDownloads(request, env);
    }

    const downloadAdminMatch =
      path.match(/^admin\/downloads\/([^/]+)$/);

    if (downloadAdminMatch && method === "PUT") {
      return adminUpdateDownload(
        request,
        env,
        decodeURIComponent(downloadAdminMatch[1])
      );
    }

    const titleMatch = path.match(/^admin\/titles\/([^/]+)$/);

    if (titleMatch && method === "GET") {
      return adminGetTitle(request, env, decodeURIComponent(titleMatch[1]));
    }

    if (titleMatch && method === "PUT") {
      return adminUpdateTitle(request, env, decodeURIComponent(titleMatch[1]));
    }

    if (titleMatch && method === "DELETE") {
      return adminDeleteTitle(request, env, decodeURIComponent(titleMatch[1]));
    }

    if (path === "admin/settings" && method === "GET") {
      return adminGetSettings(request, env);
    }

    if (path === "admin/settings" && method === "PUT") {
      return adminUpdateSettings(request, env);
    }

    return json({ error: "API endpoint မတွေ့ပါ" }, 404);
  } catch (error) {
    console.error(error);
    return json(
      {
        error: "server_error",
        message: error?.message || "Server error"
      },
      500
    );
  }
}

/* -------------------- Helpers -------------------- */

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
      ...extraHeaders
    }
  });
}
function normalizeDeviceId(value) {
  const deviceId = String(value || "").trim();

  if (!/^[a-zA-Z0-9._:-]{16,128}$/.test(deviceId)) {
    return "";
  }

  return deviceId;
}

function deviceIdFromRequest(request, body = null) {
  return normalizeDeviceId(
    body?.deviceId ||
    request.headers.get("x-cmflix-device-id") ||
    ""
  );
}

function vipActive(user, now = Date.now()) {
  return Number(user?.vip_until || 0) > now;
}

async function readBody(request) {
  const contentType = request.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    throw new Error("JSON body လိုအပ်ပါသည်");
  }

  return request.json();
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeUsername(value) {
  return String(value || "").trim();
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validUsername(username) {
  return /^[a-zA-Z0-9_.-]{3,30}$/.test(username);
}

function slugify(value) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u1000-\u109f]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);

  return slug || crypto.randomUUID();
}

function parseCookies(request) {
  const result = {};
  const raw = request.headers.get("cookie") || "";

  for (const part of raw.split(";")) {
    const index = part.indexOf("=");

    if (index > 0) {
      const key = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();
      result[key] = decodeURIComponent(value);
    }
  }

  return result;
}

function randomToken(bytes = 32) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return bytesToBase64Url(data);
}

function bytesToBase64Url(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - normalized.length % 4) % 4),
    "="
  );
  const binary = atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

async function hashPassword(password, saltValue = null, iterations = 100000) {
  const salt = saltValue
    ? base64UrlToBytes(saltValue)
    : crypto.getRandomValues(new Uint8Array(16));

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations
    },
    key,
    256
  );

  return {
    hash: bytesToBase64Url(new Uint8Array(bits)),
    salt: bytesToBase64Url(salt),
    iterations
  };
}

function safeEqual(a, b) {
  const first = encoder.encode(String(a || ""));
  const second = encoder.encode(String(b || ""));

  if (first.length !== second.length) return false;

  let difference = 0;

  for (let i = 0; i < first.length; i++) {
    difference |= first[i] ^ second[i];
  }

  return difference === 0;
}

function clientIP(request) {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

function rateLimit(request, action, limit = 10, period = 60000) {
  const now = Date.now();
  const key = `${action}:${clientIP(request)}`;
  const current = rateStore.get(key);

  if (!current || current.resetAt <= now) {
    rateStore.set(key, {
      count: 1,
      resetAt: now + period
    });

    return true;
  }

  current.count++;

  if (current.count > limit) {
    return false;
  }

  return true;
}

function sameOrigin(request) {
  const origin = request.headers.get("origin");

  if (!origin) return true;

  return origin === new URL(request.url).origin;
}

async function verifyTurnstile(request, env, token) {
  if (!env.TURNSTILE_SECRET_KEY) return true;
  if (!token) return false;

  const body = new FormData();
  body.append("secret", env.TURNSTILE_SECRET_KEY);
  body.append("response", token);
  body.append("remoteip", clientIP(request));

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body
    }
  );

  const result = await response.json();
  return result.success === true;
}

/* -------------------- Authentication -------------------- */

async function createSession(
  env,
  userId,
  deviceId = ""
) {
  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const csrf = randomToken(24);
  const now = Date.now();
  const days = Math.max(
    1,
    Number(env.SESSION_DAYS || 30)
  );
  const expiresAt =
    now + days * 86400000;

  await env.DB.prepare(
    `INSERT INTO sessions
     (
       token_hash,
       user_id,
       csrf_token,
       device_id,
       expires_at,
       created_at
     )
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    tokenHash,
    userId,
    csrf,
    deviceId,
    expiresAt,
    now
  ).run();

  return {
    token,
    tokenHash,
    csrf,
    deviceId,
    expiresAt
  };
}

function sessionCookie(token, expiresAt) {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    `Expires=${new Date(expiresAt).toUTCString()}`
  ].join("; ");
}

function clearSessionCookie() {
  return [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    "Max-Age=0"
  ].join("; ");
}

async function getAuth(request, env) {
  const token =
    parseCookies(request)[SESSION_COOKIE];

  if (!token) {
    return null;
  }

  if (Math.random() < 0.02) {
    try {
      await env.DB.prepare(
        "DELETE FROM sessions WHERE expires_at <= ?"
      ).bind(Date.now()).run();
    } catch (_) {
      // Cleanup failure ကို ignore လုပ်မယ်။
    }
  }

  const tokenHash = await sha256(token);
  const now = Date.now();

  const row = await env.DB.prepare(
    `SELECT
       s.token_hash,
       s.csrf_token,
       s.device_id AS session_device_id,
       s.expires_at,
       u.id,
       u.username,
       u.email,
       u.role,
       u.status,
       u.vip_until,
       u.vip_device_id
     FROM sessions AS s
     JOIN users AS u
       ON u.id = s.user_id
     WHERE s.token_hash = ?
       AND s.expires_at > ?
     LIMIT 1`
  ).bind(
    tokenHash,
    now
  ).first();

  if (!row || row.status !== "active") {
    return null;
  }

  return {
    tokenHash: row.token_hash,
    csrf: row.csrf_token,
    sessionDeviceId:
      row.session_device_id || "",
    user: {
      id: row.id,
      username: row.username,
      email: row.email,
      role: row.role,
      vipUntil:
        Number(row.vip_until || 0),
      isVip:
        Number(row.vip_until || 0) > now,
      vipDeviceBound:
        Boolean(row.vip_device_id),
      vipDeviceId:
        row.vip_device_id || ""
    }
  };
}


async function requireAuth(request, env) {
  const auth = await getAuth(request, env);

  if (!auth) {
    return {
      error: json({ error: "Login ဝင်ရန်လိုအပ်ပါသည်" }, 401)
    };
  }

  return { auth };
}

async function requireAdmin(request, env, mutation = false) {
  const result = await requireAuth(request, env);

  if (result.error) return result;

  if (result.auth.user.role !== "admin") {
    return {
      error: json({ error: "Admin ခွင့်ပြုချက်လိုအပ်ပါသည်" }, 403)
    };
  }

  if (mutation) {
    if (!sameOrigin(request)) {
      return {
        error: json({ error: "Invalid request origin" }, 403)
      };
    }

    const csrf = request.headers.get("x-csrf-token") || "";

    if (!safeEqual(csrf, result.auth.csrf)) {
      return {
        error: json({ error: "CSRF token မှားနေပါသည်" }, 403)
      };
    }
  }

  return result;
}

async function setupAdmin(request, env) {
  if (!rateLimit(request, "setup", 5, 60000)) {
    return json({ error: "ခဏစောင့်ပြီး ပြန်ကြိုးစားပါ" }, 429);
  }

  const existing = await env.DB.prepare(
    "SELECT id FROM users WHERE role='admin' LIMIT 1"
  ).first();

  if (existing) {
    return json({ error: "Admin account ရှိပြီးသားဖြစ်ပါသည်" }, 409);
  }

  const body = await readBody(request);

  if (!env.SETUP_TOKEN || !safeEqual(body.setupToken, env.SETUP_TOKEN)) {
    return json({ error: "Setup token မှားနေပါသည်" }, 403);
  }

  return createUser(body, env, "admin");
}

async function register(request, env) {
  if (!rateLimit(request, "register", 5, 10 * 60000)) {
    return json({ error: "Register အကြိမ်များလွန်းပါသည်" }, 429);
  }

  const body = await readBody(request);

  if (!(await verifyTurnstile(request, env, body.turnstileToken))) {
    return json({ error: "Turnstile verification မအောင်မြင်ပါ" }, 400);
  }

  return createUser(body, env, "user");
}

async function createUser(body, env, role) {
  const username = normalizeUsername(body.username);
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");

  if (!validUsername(username)) {
    return json(
      {
        error:
          "Username သည် 3–30 လုံးဖြစ်ပြီး English စာ၊ ဂဏန်း၊ _.- သာသုံးပါ"
      },
      400
    );
  }

  if (!validEmail(email)) {
    return json({ error: "Email format မမှန်ပါ" }, 400);
  }

  if (password.length < 8 || password.length > 128) {
    return json({ error: "Password အနည်းဆုံး 8 လုံးထားပါ" }, 400);
  }

  const duplicate = await env.DB.prepare(
    "SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1"
  ).bind(username, email).first();

  if (duplicate) {
    return json({ error: "Username သို့မဟုတ် email ရှိပြီးသားပါ" }, 409);
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  const passwordData = await hashPassword(password);

  await env.DB.prepare(
    `INSERT INTO users
     (id, username, email, password_hash, password_salt,
      password_iterations, role, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
  ).bind(
    id,
    username,
    email,
    passwordData.hash,
    passwordData.salt,
    passwordData.iterations,
    role,
    now,
    now
  ).run();

  const deviceId =
    normalizeDeviceId(body.deviceId);

  const session = await createSession(
    env,
    id,
    deviceId
  );

  return json(
    {
      ok: true,
      csrf: session.csrf,
      user: {
  id,
  username,
  email,
  role,
  vipUntil: 0,
  isVip: false,
  vipDeviceBound: false
}
    },
    201,
    {
      "set-cookie": sessionCookie(session.token, session.expiresAt)
    }
  );
}

async function login(request, env) {
  if (!rateLimit(request, "login", 10, 5 * 60000)) {
    return json(
      { error: "Login အကြိမ်များလွန်းပါသည်" },
      429
    );
  }

  const body = await readBody(request);

  if (
    !(await verifyTurnstile(
      request,
      env,
      body.turnstileToken
    ))
  ) {
    return json(
      {
        error:
          "Turnstile verification မအောင်မြင်ပါ"
      },
      400
    );
  }

  const identity =
    String(body.identity || "").trim();

  const password =
    String(body.password || "");

  const deviceId =
    deviceIdFromRequest(request, body);

  const user = await env.DB.prepare(
    `SELECT *
     FROM users
     WHERE username = ? COLLATE NOCASE
        OR email = ? COLLATE NOCASE
     LIMIT 1`
  ).bind(
    identity,
    normalizeEmail(identity)
  ).first();

  if (!user || user.status !== "active") {
    return json(
      {
        error:
          "Login information မှားနေပါသည်"
      },
      401
    );
  }

  const passwordData =
    await hashPassword(
      password,
      user.password_salt,
      user.password_iterations
    );

  if (
    !safeEqual(
      passwordData.hash,
      user.password_hash
    )
  ) {
    return json(
      {
        error:
          "Login information မှားနေပါသည်"
      },
      401
    );
  }

  const now = Date.now();
  const isVip =
    Number(user.vip_until || 0) > now;

  /*
   * Admin account ကို device lock မလုပ်ပါ။
   * VIP user ကိုသာ တစ်စက်တည်းသုံးခွင့်ပေးမယ်။
   */
  if (isVip && user.role !== "admin") {
    if (!deviceId) {
      return json(
        {
          error: "device_id_required",
          message:
            "Device ID မရပါ။ App ကို update လုပ်ပြီး ပြန်ဝင်ပါ။"
        },
        400
      );
    }

    if (
      user.vip_device_id &&
      user.vip_device_id !== deviceId
    ) {
      return json(
        {
          error: "vip_device_limit",
          message:
            "ဤ VIP account ကို တခြားဖုန်းတွင် အသုံးပြုနေပါသည်။ အရင်ဖုန်းမှ logout ထွက်ပါ သို့မဟုတ် admin ကို device reset တောင်းပါ။"
        },
        409
      );
    }

    if (!user.vip_device_id) {
      await env.DB.prepare(
        `UPDATE users
         SET vip_device_id = ?,
             updated_at = ?
         WHERE id = ?
           AND vip_device_id IS NULL`
      ).bind(
        deviceId,
        now,
        user.id
      ).run();

      const updated =
        await env.DB.prepare(
          `SELECT vip_device_id
           FROM users
           WHERE id = ?`
        ).bind(user.id).first();

      if (
        updated?.vip_device_id !== deviceId
      ) {
        return json(
          {
            error: "vip_device_limit",
            message:
              "VIP account ကို တခြားစက်က အသုံးပြုနေပါသည်။"
          },
          409
        );
      }
    }

    /*
     * VIP account မှာ active session တစ်ခုတည်းထားမယ်။
     */
    await env.DB.prepare(
      "DELETE FROM sessions WHERE user_id = ?"
    ).bind(user.id).run();
  }

  const session = await createSession(
    env,
    user.id,
    deviceId
  );

  return json(
    {
      ok: true,
      csrf: session.csrf,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        vipUntil:
          Number(user.vip_until || 0),
        isVip,
        vipDeviceBound:
          Boolean(
            isVip &&
            (
              user.vip_device_id ||
              deviceId
            )
          )
      }
    },
    200,
    {
      "set-cookie":
        sessionCookie(
          session.token,
          session.expiresAt
        )
    }
  );
}


async function logout(request, env) {
  const auth = await getAuth(request, env);

  if (auth) {
    const csrf =
      request.headers.get("x-csrf-token") || "";

    if (!safeEqual(csrf, auth.csrf)) {
      return json(
        { error: "CSRF token မှားနေပါသည်" },
        403
      );
    }

    const statements = [
      env.DB.prepare(
        `DELETE FROM sessions
         WHERE token_hash = ?`
      ).bind(auth.tokenHash)
    ];

    if (
      auth.sessionDeviceId &&
      auth.user.vipDeviceId ===
        auth.sessionDeviceId
    ) {
      statements.push(
        env.DB.prepare(
          `UPDATE users
           SET vip_device_id = NULL,
               updated_at = ?
           WHERE id = ?
             AND vip_device_id = ?`
        ).bind(
          Date.now(),
          auth.user.id,
          auth.sessionDeviceId
        )
      );
    }

    await env.DB.batch(statements);
  }

  return json(
    { ok: true },
    200,
    {
      "set-cookie": clearSessionCookie()
    }
  );
}


async function me(request, env) {
  const auth = await getAuth(request, env);

  if (!auth) {
    return json({ user: null, csrf: "" });
  }

  return json({
    user: auth.user,
    csrf: auth.csrf
  });
}

/* -------------------- Settings -------------------- */

async function getSetting(env, key, fallback = "") {
  const row = await env.DB.prepare(
    "SELECT setting_value FROM settings WHERE setting_key = ?"
  ).bind(key).first();

  return row ? row.setting_value : fallback;
}

async function getStatus(env) {
  return json(
    {
      appName: env.APP_NAME || "CMFLIX",
      maintenance:
        (await getSetting(env, "maintenance_mode", "0")) === "1",
      message: await getSetting(
        env,
        "maintenance_message",
        "CMFLIX ကို ခေတ္တပြုပြင်နေပါသည်။"
      ),
      turnstileSiteKey: env.TURNSTILE_SITE_KEY || ""
    },
    200,
    {
      "cache-control": "no-store"
    }
  );
}
async function bootstrap(request, env) {
  const settingsResult = await env.DB.prepare(
    `SELECT setting_key, setting_value
     FROM settings
     WHERE setting_key IN (
       'maintenance_mode',
       'maintenance_message'
     )`
  ).all();

  const settings = Object.fromEntries(
    (settingsResult.results || []).map(row => [
      row.setting_key,
      row.setting_value
    ])
  );

  /*
   * Cookie မရှိတဲ့ anonymous visitor အတွက်
   * session D1 query မလုပ်ပါ။
   */
  const cookies = parseCookies(request);
  const auth = cookies[SESSION_COOKIE]
    ? await getAuth(request, env)
    : null;

  return json(
    {
      appName: env.APP_NAME || "CMFLIX",
      maintenance:
        settings.maintenance_mode === "1",
      message:
        settings.maintenance_message ||
        "CMFLIX ကို ခေတ္တပြုပြင်နေပါသည်။",
      turnstileSiteKey:
        env.TURNSTILE_SITE_KEY || "",
      user: auth?.user || null,
      csrf: auth?.csrf || ""
    },
    200,
    {
      "cache-control": "no-store"
    }
  );
}

/* -------------------- TMDB image proxy -------------------- */

/*
 * App/database ထဲက TMDB image URL ကို
 * same-origin proxy URL အဖြစ် ပြောင်းပေးပါတယ်။
 *
 * Custom poster URL တွေကိုတော့ မပြောင်းပါ။
 */
/*
 * Proxy ဖြုတ်လိုက်ပါပြီ။
 *
 * - TMDB ပုံ URL တွေကို image.tmdb.org ကနေ တိုက်ရိုက်သုံးမယ်။
 * - အရင်က သိမ်းထားခဲ့တဲ့ /api/tmdb-image/{size}/{file} proxy path
 *   တွေကိုလည်း မူရင်း image.tmdb.org URL အဖြစ် ပြန်ပြောင်းပေးမယ်။
 * - Custom link ပုံတွေ (image.tmdb.org မဟုတ်တာ) ကိုတော့
 *   မူရင်းအတိုင်း ဘာမှမပြင်ဘဲ ပြန်ပေးမယ်။
 */
function proxiedTMDBImageURL(
  value,
  preferredSize = "w500"
) {
  const raw = String(value || "").trim();

  if (!raw) {
    return "";
  }

  const allowedSizes = new Set([
    "original",
    "w92",
    "w154",
    "w185",
    "w300",
    "w342",
    "w500",
    "w780",
    "w1280"
  ]);

  const safeSize = allowedSizes.has(preferredSize)
    ? preferredSize
    : "w500";

  /*
   * အရင် proxy path (/api/tmdb-image/{size}/{file}) အဟောင်းတွေကို
   * image.tmdb.org URL အဖြစ် ပြန်ပြောင်းပေးမယ်။
   */
  const proxyMatch = raw.match(
    /^\/api\/tmdb-image\/[^/]+\/(.+)$/i
  );

  if (proxyMatch) {
    const filePath = proxyMatch[1]
      .split("/")
      .filter(Boolean)
      .join("/");

    return filePath
      ? `https://image.tmdb.org/t/p/${safeSize}/${filePath}`
      : "";
  }

  let parsed;

  try {
    parsed = new URL(raw);
  } catch {
    /*
     * Custom relative URL ဖြစ်နိုင်လို့ မူရင်းအတိုင်း ပြန်ပေးမယ်။
     */
    return raw;
  }

  /*
   * image.tmdb.org မဟုတ်ရင် custom link ပုံဖြစ်လို့
   * ဘာမှမပြင်ဘဲ မူရင်းအတိုင်း ပြန်ပေးမယ်။
   */
  if (
    parsed.hostname.toLowerCase() !==
    "image.tmdb.org"
  ) {
    return raw;
  }

  /*
   * image.tmdb.org URL ဖြစ်ရင် လိုချင်တဲ့ size ကို
   * ချိန်ညှိပြီး တိုက်ရိုက် URL ပြန်ပေးမယ်။
   */
  const match = parsed.pathname.match(
    /^\/t\/p\/[^/]+\/(.+)$/
  );

  if (!match) {
    return raw;
  }

  const filePath = match[1]
    .split("/")
    .filter(Boolean)
    .join("/");

  if (!filePath) {
    return "";
  }

  return `https://image.tmdb.org/t/p/${safeSize}/${filePath}`;
}


/*
 * /api/tmdb-image/{size}/{file}
 *
 * ဥပမာ:
 * /api/tmdb-image/w500/abc123.jpg
 * /api/tmdb-image/original/abc123.jpg
 */
async function proxyTMDBImage(
  request,
  context,
  rawImagePath
) {
  let decodedPath;

  try {
    decodedPath = decodeURIComponent(
      String(rawImagePath || "")
    );
  } catch {
    return json({ error: "Image path မမှန်ပါ" }, 400);
  }

  const parts = decodedPath
    .split("/")
    .filter(Boolean);

  const size = parts.shift() || "";
  const filePath = parts.join("/");

  /*
   * TMDB မှာ အသုံးများတဲ့ size တွေကိုသာ ခွင့်ပြုပါတယ်။
   * ဒီ validation ကြောင့် endpoint ကို open proxy
   * အဖြစ် အသုံးချလို့မရပါ။
   */
  const allowedSizes = new Set([
    "original",
    "w92",
    "w154",
    "w185",
    "w300",
    "w342",
    "w500",
    "w780",
    "w1280"
  ]);

  if (!allowedSizes.has(size)) {
    return json({ error: "Image size မမှန်ပါ" }, 400);
  }

  if (
    !filePath ||
    filePath.includes("..") ||
    !/^[a-zA-Z0-9._/-]+\.(jpg|jpeg|png|webp)$/i.test(
      filePath
    )
  ) {
    return json({ error: "Image file မမှန်ပါ" }, 400);
  }

  const cache = caches.default;
  const cacheKey = new Request(request.url, {
    method: "GET"
  });

  const cachedResponse = await cache.match(cacheKey);

  if (cachedResponse) {
    return cachedResponse;
  }

  const safeFilePath = filePath
    .split("/")
    .map(part => encodeURIComponent(part))
    .join("/");

  const upstreamURL =
    `https://image.tmdb.org/t/p/` +
    `${encodeURIComponent(size)}/` +
    safeFilePath;

  let upstreamResponse;

  try {
    upstreamResponse = await fetch(upstreamURL, {
      headers: {
        accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
      },
      cf: {
        cacheEverything: true,
        cacheTtl: 2592000
      }
    });
  } catch (error) {
    console.error("TMDB image fetch error:", error);

    return json(
      { error: "TMDB image ယူ၍မရပါ" },
      502
    );
  }

  if (!upstreamResponse.ok) {
    return json(
      {
        error: "TMDB image မတွေ့ပါ",
        upstreamStatus: upstreamResponse.status
      },
      upstreamResponse.status === 404 ? 404 : 502
    );
  }

  const contentType =
    upstreamResponse.headers.get("content-type") || "";

  if (!contentType.startsWith("image/")) {
    return json(
      { error: "Upstream response သည် image မဟုတ်ပါ" },
      502
    );
  }

  const headers = new Headers();

  headers.set("content-type", contentType);
  headers.set(
  "cache-control",
  "public, max-age=31536000, s-maxage=31536000, immutable"
);

  headers.set("x-content-type-options", "nosniff");

  const etag = upstreamResponse.headers.get("etag");

  if (etag) {
    headers.set("etag", etag);
  }

  const response = new Response(
    upstreamResponse.body,
    {
      status: 200,
      headers
    }
  );

  context.waitUntil(
    cache.put(cacheKey, response.clone())
  );

  return response;
}

/* -------------------- TMDB helpers -------------------- */

async function fetchTMDBDetails(env, tmdbType, tmdbId) {
  if (!env.TMDB_API_KEY || !tmdbId) {
    return null;
  }

  const type = tmdbType === "tv" ? "tv" : "movie";

  const tmdbURL = new URL(
    `https://api.themoviedb.org/3/${type}/${encodeURIComponent(tmdbId)}`
  );

  tmdbURL.searchParams.set("api_key", env.TMDB_API_KEY);
  tmdbURL.searchParams.set("language", "en-US");
  tmdbURL.searchParams.set("append_to_response", "credits");

  try {
    const response = await fetch(tmdbURL, {
      headers: {
        accept: "application/json"
      },
      cf: {
        cacheTtl: 21600,
        cacheEverything: true
      }
    });

    if (!response.ok) {
      console.error(
        "TMDB details request failed:",
        response.status,
        type,
        tmdbId
      );

      return null;
    }

    const data = await response.json();

    return {
      genres: (data.genres || [])
        .map(genre => genre.name)
        .filter(Boolean)
        .join(", "),

      cast: (data.credits?.cast || [])
        .slice(0, 15)
        .map(person => ({
          id: person.id,
          name: person.name || person.original_name || "",
          character: person.character || "",
          profile_url: person.profile_path
            ? proxiedTMDBImageURL(
                `https://image.tmdb.org/t/p/w185${person.profile_path}`,
                "w185"
              )
            : ""
        }))
    };
  } catch (error) {
    console.error("TMDB details error:", error);
    return null;
  }
}
function buildFTSSearchQuery(value) {
  const normalized = String(value || "")
    .normalize("NFKC")
    .trim()
    .slice(0, 50);

  const tokens =
    normalized.match(
      /[\p{L}\p{M}\p{N}]+/gu
    ) || [];

  return tokens
    .filter(token => [...token].length >= 2)
    .slice(0, 8)
    .map(token => `"${token}"*`)
    .join(" AND ");
}

async function publicTitles(
  request,
  env,
  context
) {
  const url = new URL(request.url);

  const category =
    url.searchParams.get("category") ||
    "movies";

  const search = String(
    url.searchParams.get("q") || ""
  )
    .normalize("NFKC")
    .trim()
    .slice(0, 50);

  const requestedPage = Number(
    url.searchParams.get("page") || 1
  );

  const page =
    Number.isFinite(requestedPage)
      ? Math.max(
          1,
          Math.min(
            Math.floor(requestedPage),
            1000
          )
        )
      : 1;

  const limit = 15;
  const offset = (page - 1) * limit;

  if (
    ![
      "movies",
      "series",
      "lugyi"
    ].includes(category)
  ) {
    return json(
      {
        error: "Category မှားနေပါသည်"
      },
      400
    );
  }

  const ftsSearch =
    buildFTSSearchQuery(search);

  /*
   * 1-character search ကို FTS prefix search
   * မလုပ်ပါ။ Query အလွန်ကျယ်သွားတာကို
   * တားပေးပါတယ်။
   */
  if (search && !ftsSearch) {
    return json(
      {
        items: [],
        page,
        hasMore: false
      },
      200,
      {
        "cache-control":
          "public, max-age=60, s-maxage=60"
      }
    );
  }

  const cache = caches.default;

  const cacheURL =
    new URL(url.toString());

  /*
   * Search/data format ပြောင်းထားတာကြောင့်
   * အဟောင်း cache မသုံးပါ။
   */
  cacheURL.searchParams.set(
    "_dataVersion",
    "6"
  );

  const cacheKey =
    new Request(
      cacheURL.toString(),
      {
        method: "GET"
      }
    );

  const cached =
    await cache.match(cacheKey);

  if (cached) {
    return cached;
  }

  let query;
  let params;

  if (ftsSearch) {
    query = `
      SELECT
        t.id,
        t.slug,
        t.tmdb_id,
        t.tmdb_type,
        t.category,
        t.title,
        t.original_title,
        t.overview,
        t.poster_url,
        t.backdrop_url,
        t.release_date,
        t.year,
        t.rating,
        t.genres,
        t.featured,
        t.created_at,
        t.updated_at
      FROM titles AS t
      JOIN titles_fts
        ON titles_fts.rowid = t.rowid
      WHERE t.status = 'public'
        AND t.category = ?
        AND titles_fts MATCH ?
      ORDER BY
        t.featured DESC,
        t.updated_at DESC,
        t.created_at DESC
      LIMIT ?
      OFFSET ?
    `;

    params = [
      category,
      ftsSearch,
      limit,
      offset
    ];
  } else {
    query = `
      SELECT
        id,
        slug,
        tmdb_id,
        tmdb_type,
        category,
        title,
        original_title,
        overview,
        poster_url,
        backdrop_url,
        release_date,
        year,
        rating,
        genres,
        featured,
        created_at,
        updated_at
      FROM titles
      WHERE status = 'public'
        AND category = ?
      ORDER BY
        featured DESC,
        updated_at DESC,
        created_at DESC
      LIMIT ?
      OFFSET ?
    `;

    params = [
      category,
      limit,
      offset
    ];
  }

  const result =
    await env.DB
      .prepare(query)
      .bind(...params)
      .all();

  const databaseItems =
    result.results || [];

  const items =
    databaseItems.map(item => ({
      ...item,

      genres:
        String(
          item.genres || ""
        ).trim(),

      poster_url:
        proxiedTMDBImageURL(
          item.poster_url,
          "w342"
        ),

      backdrop_url:
        proxiedTMDBImageURL(
          item.backdrop_url,
          "w780"
        )
    }));

  const response = json(
    {
      items,
      page,
      hasMore:
        databaseItems.length === limit
    },
    200,
    {
      "cache-control":
        "public, max-age=300, " +
        "s-maxage=300, " +
        "stale-while-revalidate=600"
    }
  );

  context.waitUntil(
    cache.put(
      cacheKey,
      response.clone()
    )
  );

  return response;
}



async function publicTitle(
  request,
  env,
  slug,
  context
) {
  const cache = caches.default;
  const cacheURL = new URL(request.url);

  /*
   * Data format ပြောင်းထားတာကြောင့်
   * အဟောင်း cache မသုံးအောင် version တိုးထားပါတယ်။
   */
  cacheURL.searchParams.set(
    "_dataVersion",
    "7"
  );

  const cacheKey = new Request(
    cacheURL.toString(),
    {
      method: "GET"
    }
  );

  const cached =
    await cache.match(cacheKey);

  if (cached) {
    return cached;
  }

  const title = await env.DB.prepare(
    `SELECT *
     FROM titles
     WHERE slug = ?
       AND status = 'public'
     LIMIT 1`
  )
    .bind(slug)
    .first();

  if (!title) {
    return json(
      { error: "ဇာတ်ကားမတွေ့ပါ" },
      404
    );
  }

  const episodesResult =
    await env.DB.prepare(
      `SELECT
         id,
         season_number,
         episode_number,
         episode_title,
         video_url,
         video_type
       FROM episodes
       WHERE title_id = ?
       ORDER BY
         season_number ASC,
         episode_number ASC`
    )
      .bind(title.id)
      .all();

  const isVipTitle =
    title.category === "lugyi";

  const episodes =
    (episodesResult.results || []).map(
      episode => ({
        ...episode,
        has_video:
          Boolean(episode.video_url),

        /*
         * 18+ episode URL ကို public response
         * ထဲမထည့်ပါ။
         */
        video_url:
          isVipTitle
            ? ""
            : episode.video_url
      })
    );

  const item = {
    ...title,

    genres:
      String(title.genres || "").trim(),

    poster_url: proxiedTMDBImageURL(
      title.poster_url,
      "w500"
    ),

    backdrop_url: proxiedTMDBImageURL(
      title.backdrop_url,
      "w1280"
    ),

    has_video:
      Boolean(title.video_url),

    /*
     * Movies/Series link ပုံမှန်ပြန်ပေးမယ်။
     * 18+ link ကို /api/play ကသာပြန်ပေးမယ်။
     */
    video_url:
      isVipTitle
        ? ""
        : title.video_url,

    vip_required: isVipTitle,

    episodes
  };

  const response = json(
    { item },
    200,
    {
      /*
       * ကြည့်ပြီးသား detail page ကို 5 minutes အတွင်း
       * ပြန်ဖွင့်ရင် browser cache ကနေယူနိုင်ပါတယ်။
       */
      "cache-control":
        "public, max-age=300, " +
        "s-maxage=300, " +
        "stale-while-revalidate=600"
    }
  );

  context.waitUntil(
    cache.put(
      cacheKey,
      response.clone()
    )
  );

  return response;
}



/* -------------------- Favorites -------------------- */

async function listFavorites(request, env) {
  const result = await requireAuth(request, env);
  if (result.error) return result.error;

  const rows = await env.DB.prepare(
    `SELECT
       t.id, t.slug, t.category, t.title, t.poster_url,
       t.year, t.rating, f.created_at AS favorited_at
     FROM favorites f
     JOIN titles t ON t.id=f.title_id
     WHERE f.user_id=? AND t.status='public'
     ORDER BY f.created_at DESC
     LIMIT 100`
  ).bind(result.auth.user.id).all();

  const items = (rows.results || []).map(item => ({
    ...item,
    poster_url: proxiedTMDBImageURL(
      item.poster_url,
      "w500"
    )
  }));

  return json({ items });
}

async function addFavorite(request, env, titleId) {
  const result = await requireAuth(request, env);
  if (result.error) return result.error;

  if (!sameOrigin(request)) {
    return json({ error: "Invalid request origin" }, 403);
  }

  if (!safeEqual(
    request.headers.get("x-csrf-token") || "",
    result.auth.csrf
  )) {
    return json({ error: "CSRF token မှားနေပါသည်" }, 403);
  }

  await env.DB.prepare(
    `INSERT OR IGNORE INTO favorites
     (user_id, title_id, created_at)
     SELECT ?, id, ?
     FROM titles
     WHERE id=? AND status='public'`
  ).bind(
    result.auth.user.id,
    Date.now(),
    titleId
  ).run();

  return json({ ok: true });
}

async function removeFavorite(request, env, titleId) {
  const result = await requireAuth(request, env);
  if (result.error) return result.error;

  if (!sameOrigin(request)) {
    return json({ error: "Invalid request origin" }, 403);
  }

  if (!safeEqual(
    request.headers.get("x-csrf-token") || "",
    result.auth.csrf
  )) {
    return json({ error: "CSRF token မှားနေပါသည်" }, 403);
  }

  await env.DB.prepare(
    "DELETE FROM favorites WHERE user_id=? AND title_id=?"
  ).bind(result.auth.user.id, titleId).run();

  return json({ ok: true });
}

/* -------------------- TMDB -------------------- */

async function tmdbSearch(request, env) {
  const admin = await requireAdmin(request, env);

  if (admin.error) {
    return admin.error;
  }

  if (!env.TMDB_API_KEY) {
    return json(
      { error: "TMDB_API_KEY မသတ်မှတ်ရသေးပါ" },
      500
    );
  }

  const url = new URL(request.url);

  const query = String(
    url.searchParams.get("q") || ""
  )
    .trim()
    .slice(0, 80);

  if (query.length < 2) {
    return json({ results: [] });
  }

  const tmdbURL = new URL(
    "https://api.themoviedb.org/3/search/multi"
  );

  tmdbURL.searchParams.set(
    "api_key",
    env.TMDB_API_KEY
  );

  tmdbURL.searchParams.set("query", query);
  tmdbURL.searchParams.set("include_adult", "false");
  tmdbURL.searchParams.set("language", "en-US");
  tmdbURL.searchParams.set("page", "1");

  const response = await fetch(tmdbURL, {
    headers: {
      accept: "application/json"
    },
    cf: {
      cacheTtl: 3600,
      cacheEverything: true
    }
  });

  if (!response.ok) {
    return json(
      { error: "TMDB request မအောင်မြင်ပါ" },
      502
    );
  }

  const data = await response.json();

  /*
   * TMDB genre ID များ
   * Movie နဲ့ TV genre နှစ်မျိုးလုံးထည့်ထားပါတယ်။
   */
  const genreNames = {
    12: "Adventure",
    14: "Fantasy",
    16: "Animation",
    18: "Drama",
    27: "Horror",
    28: "Action",
    35: "Comedy",
    36: "History",
    37: "Western",
    53: "Thriller",
    80: "Crime",
    99: "Documentary",
    878: "Science Fiction",
    9648: "Mystery",
    10402: "Music",
    10749: "Romance",
    10751: "Family",
    10752: "War",
    10759: "Action & Adventure",
    10762: "Kids",
    10763: "News",
    10764: "Reality",
    10765: "Sci-Fi & Fantasy",
    10766: "Soap",
    10767: "Talk",
    10768: "War & Politics",
    10770: "TV Movie"
  };

  const results = (data.results || [])
    .filter(item =>
      item.media_type === "movie" ||
      item.media_type === "tv"
    )
    .slice(0, 15)
    .map(item => {
      const releaseDate =
        item.release_date ||
        item.first_air_date ||
        "";

      return {
        tmdb_id: item.id,
        tmdb_type: item.media_type,

        title:
          item.title ||
          item.name ||
          "",

        original_title:
          item.original_title ||
          item.original_name ||
          "",

        overview: item.overview || "",

        poster_url: item.poster_path
          ? proxiedTMDBImageURL(
              `https://image.tmdb.org/t/p/w500${item.poster_path}`,
              "w500"
            )
          : "",

        backdrop_url: item.backdrop_path
          ? proxiedTMDBImageURL(
              `https://image.tmdb.org/t/p/original${item.backdrop_path}`,
              "original"
            )
          : "",

        release_date: releaseDate,

        year:
          Number(String(releaseDate).slice(0, 4)) ||
          null,

        rating: Number(item.vote_average || 0),

        category:
          item.media_type === "tv"
            ? "series"
            : "movies",

        genres: (item.genre_ids || [])
          .map(id => genreNames[id])
          .filter(Boolean)
          .join(", ")
      };
    });

  return json({ results });
}


/* -------------------- Admin CRUD -------------------- */

async function adminTitles(request, env) {
  const admin = await requireAdmin(request, env);
  if (admin.error) return admin.error;

  const url = new URL(request.url);
  const q = String(url.searchParams.get("q") || "").trim().slice(0, 50);
  const status = url.searchParams.get("status") || "all";
  const category = url.searchParams.get("category") || "all";

  let sql = `
    SELECT id, slug, category, title, poster_url,
           year, rating, status, featured,
           created_at, updated_at
    FROM titles
    WHERE 1=1
  `;

  const params = [];

  if (status !== "all" && ["draft", "public"].includes(status)) {
    sql += " AND status=?";
    params.push(status);
  }

  if (
    category !== "all" &&
    ["movies", "series", "lugyi"].includes(category)
  ) {
    sql += " AND category=?";
    params.push(category);
  }

  if (q) {
    sql += " AND (title LIKE ? OR slug LIKE ?)";
    params.push(`%${q}%`, `%${q}%`);
  }

  sql += " ORDER BY updated_at DESC LIMIT 100";

  const rows = await env.DB
    .prepare(sql)
    .bind(...params)
    .all();

  const items = (rows.results || []).map(item => ({
    ...item,
    poster_url: proxiedTMDBImageURL(
      item.poster_url,
      "w500"
    )
  }));

  return json({ items });
}

async function adminGetTitle(request, env, id) {
  const admin = await requireAdmin(request, env);
  if (admin.error) return admin.error;

  const title = await env.DB.prepare(
    "SELECT * FROM titles WHERE id=? LIMIT 1"
  ).bind(id).first();

  if (!title) {
    return json({ error: "ဇာတ်ကားမတွေ့ပါ" }, 404);
  }

  const episodes = await env.DB.prepare(
    `SELECT * FROM episodes
     WHERE title_id=?
     ORDER BY season_number, episode_number`
  ).bind(id).all();

    return json({
    item: {
      ...title,
      poster_url: proxiedTMDBImageURL(
        title.poster_url,
        "w342"
      ),
      backdrop_url: proxiedTMDBImageURL(
        title.backdrop_url,
        "w780"
      ),
      episodes: episodes.results || []
    }
  });

}

function cleanTitleBody(body) {
  const category = ["movies", "series", "lugyi"].includes(body.category)
    ? body.category
    : "movies";

  const status = body.status === "public" ? "public" : "draft";
  const videoType = ["auto", "mp4", "m3u8"].includes(body.video_type)
    ? body.video_type
    : "auto";

  return {
    slug: slugify(body.slug || body.title),
    tmdb_id: body.tmdb_id ? Number(body.tmdb_id) : null,
    tmdb_type: ["movie", "tv"].includes(body.tmdb_type)
      ? body.tmdb_type
      : "",
    category,
    title: String(body.title || "").trim().slice(0, 200),
    original_title: String(body.original_title || "").trim().slice(0, 200),
    overview: String(body.overview || "").trim().slice(0, 5000),
    poster_url: String(body.poster_url || "").trim().slice(0, 2000),
    backdrop_url: String(body.backdrop_url || "").trim().slice(0, 2000),
    release_date: String(body.release_date || "").trim().slice(0, 20),
    year: body.year ? Number(body.year) : null,
    rating: Math.max(0, Math.min(10, Number(body.rating || 0))),
    genres: String(body.genres || "").trim().slice(0, 500),
    video_url: String(body.video_url || "").trim().slice(0, 4000),
    video_type: videoType,
    status,
    featured: body.featured ? 1 : 0
  };
}

function cleanEpisodes(episodes) {
  if (!Array.isArray(episodes)) return [];

  const unique = new Map();

  for (const raw of episodes.slice(0, 500)) {
    const season = Math.max(1, Number(raw.season_number || 1));
    const episode = Math.max(1, Number(raw.episode_number || 1));
    const url = String(raw.video_url || "").trim().slice(0, 4000);

    if (!url || !/^https?:\/\//i.test(url)) continue;

    const key = `${season}:${episode}`;

    unique.set(key, {
      season_number: season,
      episode_number: episode,
      episode_title: String(raw.episode_title || "")
        .trim()
        .slice(0, 200),
      video_url: url,
      video_type: ["auto", "mp4", "m3u8"].includes(raw.video_type)
        ? raw.video_type
        : "auto"
    });
  }

  return [...unique.values()].sort(
    (a, b) =>
      a.season_number - b.season_number ||
      a.episode_number - b.episode_number
  );
}

async function adminPublishAll(request, env) {
  const admin = await requireAdmin(request, env, true);
  if (admin.error) return admin.error;

  const now = Date.now();

  /*
   * Draft ကားအားလုံးကို Public ပြောင်းမယ်။
   * updated_at ကို အသစ်ထားလို့ web ထဲ ထိပ်ဆုံးပေါ်ပါလိမ့်မယ်။
   */
  const result = await env.DB.prepare(
    `UPDATE titles
     SET status = 'public', updated_at = ?
     WHERE status = 'draft'`
  ).bind(now).run();

  return json({
    ok: true,
    published: result.meta?.changes || 0
  });
}

async function adminCreateTitle(request, env) {
  const admin = await requireAdmin(request, env, true);
  if (admin.error) return admin.error;

  const body = await readBody(request);
  const data = cleanTitleBody(body);

  if (!data.title) {
    return json({ error: "Title ဖြည့်ပါ" }, 400);
  }

  const id = crypto.randomUUID();
  const now = Date.now();

  await env.DB.prepare(
    `INSERT INTO titles (
      id, slug, tmdb_id, tmdb_type, category,
      title, original_title, overview, poster_url,
      backdrop_url, release_date, year, rating,
      genres, video_url, video_type, status,
      featured, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )`
  ).bind(
    id,
    data.slug,
    data.tmdb_id,
    data.tmdb_type,
    data.category,
    data.title,
    data.original_title,
    data.overview,
    data.poster_url,
    data.backdrop_url,
    data.release_date,
    data.year,
    data.rating,
    data.genres,
    data.video_url,
    data.video_type,
    data.status,
    data.featured,
    now,
    now
  ).run();

  await replaceEpisodes(env, id, cleanEpisodes(body.episodes));

  return json({ ok: true, id, slug: data.slug }, 201);
}

async function adminUpdateTitle(request, env, id) {
  const admin = await requireAdmin(request, env, true);
  if (admin.error) return admin.error;

  const body = await readBody(request);
  const data = cleanTitleBody(body);

  if (!data.title) {
    return json({ error: "Title ဖြည့်ပါ" }, 400);
  }

  const result = await env.DB.prepare(
    `UPDATE titles SET
      slug=?, tmdb_id=?, tmdb_type=?, category=?,
      title=?, original_title=?, overview=?,
      poster_url=?, backdrop_url=?, release_date=?,
      year=?, rating=?, genres=?, video_url=?,
      video_type=?, status=?, featured=?, updated_at=?
     WHERE id=?`
  ).bind(
    data.slug,
    data.tmdb_id,
    data.tmdb_type,
    data.category,
    data.title,
    data.original_title,
    data.overview,
    data.poster_url,
    data.backdrop_url,
    data.release_date,
    data.year,
    data.rating,
    data.genres,
    data.video_url,
    data.video_type,
    data.status,
    data.featured,
    Date.now(),
    id
  ).run();

  if (!result.meta?.changes) {
    return json({ error: "ဇာတ်ကားမတွေ့ပါ" }, 404);
  }

  await replaceEpisodes(env, id, cleanEpisodes(body.episodes));

  return json({ ok: true, id, slug: data.slug });
}

async function replaceEpisodes(env, titleId, episodes) {
  await env.DB.prepare(
    "DELETE FROM episodes WHERE title_id=?"
  ).bind(titleId).run();

  if (!episodes.length) return;

  const now = Date.now();
  const statements = episodes.map(episode =>
    env.DB.prepare(
      `INSERT INTO episodes (
        id, title_id, season_number, episode_number,
        episode_title, video_url, video_type,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(),
      titleId,
      episode.season_number,
      episode.episode_number,
      episode.episode_title,
      episode.video_url,
      episode.video_type,
      now,
      now
    )
  );

  for (let i = 0; i < statements.length; i += 40) {
    await env.DB.batch(statements.slice(i, i + 40));
  }
}

async function adminDeleteTitle(request, env, id) {
  const admin = await requireAdmin(request, env, true);
  if (admin.error) return admin.error;

  await env.DB.prepare(
    "DELETE FROM titles WHERE id=?"
  ).bind(id).run();

  return json({ ok: true });
}

async function adminGetSettings(request, env) {
  const admin = await requireAdmin(request, env);
  if (admin.error) return admin.error;

  return json({
    maintenance:
      (await getSetting(env, "maintenance_mode", "0")) === "1",
    maintenanceMessage: await getSetting(
      env,
      "maintenance_message",
      "CMFLIX ကို ခေတ္တပြုပြင်နေပါသည်။"
    )
  });
}

async function adminUpdateSettings(request, env) {
  const admin = await requireAdmin(request, env, true);
  if (admin.error) return admin.error;

  const body = await readBody(request);
  const now = Date.now();
  const enabled = body.maintenance ? "1" : "0";
  const message = String(
    body.maintenanceMessage ||
    "CMFLIX ကို ခေတ္တပြုပြင်နေပါသည်။"
  ).slice(0, 500);

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO settings
       (setting_key, setting_value, updated_at)
       VALUES ('maintenance_mode', ?, ?)
       ON CONFLICT(setting_key)
       DO UPDATE SET
         setting_value=excluded.setting_value,
         updated_at=excluded.updated_at`
    ).bind(enabled, now),

    env.DB.prepare(
      `INSERT INTO settings
       (setting_key, setting_value, updated_at)
       VALUES ('maintenance_message', ?, ?)
       ON CONFLICT(setting_key)
       DO UPDATE SET
         setting_value=excluded.setting_value,
         updated_at=excluded.updated_at`
    ).bind(message, now)
  ]);

  return json({ ok: true });
}
async function changePassword(request, env) {
  const result =
    await requireAuth(request, env);

  if (result.error) {
    return result.error;
  }

  const csrf =
    request.headers.get("x-csrf-token") || "";

  if (!safeEqual(csrf, result.auth.csrf)) {
    return json(
      { error: "CSRF token မှားနေပါသည်" },
      403
    );
  }

  if (
    !rateLimit(
      request,
      "change-password",
      5,
      10 * 60000
    )
  ) {
    return json(
      {
        error:
          "Password ပြောင်းသည့်အကြိမ် များလွန်းပါသည်"
      },
      429
    );
  }

  const body = await readBody(request);

  const currentPassword =
    String(body.currentPassword || "");

  const newPassword =
    String(body.newPassword || "");

  if (
    newPassword.length < 8 ||
    newPassword.length > 128
  ) {
    return json(
      {
        error:
          "Password အသစ်သည် 8–128 လုံးဖြစ်ရပါမည်"
      },
      400
    );
  }

  const user = await env.DB.prepare(
    `SELECT
       password_hash,
       password_salt,
       password_iterations
     FROM users
     WHERE id = ?`
  ).bind(
    result.auth.user.id
  ).first();

  if (!user) {
    return json(
      { error: "User မတွေ့ပါ" },
      404
    );
  }

  const currentData =
    await hashPassword(
      currentPassword,
      user.password_salt,
      user.password_iterations
    );

  if (
    !safeEqual(
      currentData.hash,
      user.password_hash
    )
  ) {
    return json(
      {
        error:
          "လက်ရှိ password မှားနေပါသည်"
      },
      400
    );
  }

  const passwordData =
    await hashPassword(newPassword);

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE users
       SET password_hash = ?,
           password_salt = ?,
           password_iterations = ?,
           updated_at = ?
       WHERE id = ?`
    ).bind(
      passwordData.hash,
      passwordData.salt,
      passwordData.iterations,
      Date.now(),
      result.auth.user.id
    ),

    /*
     * လက်ရှိဖုန်း session ကိုထားပြီး
     * ကျန် session များကို logout လုပ်မယ်။
     */
    env.DB.prepare(
      `DELETE FROM sessions
       WHERE user_id = ?
         AND token_hash <> ?`
    ).bind(
      result.auth.user.id,
      result.auth.tokenHash
    )
  ]);

  return json({
    ok: true,
    message:
      "Password ပြောင်းပြီးပါပြီ"
  });
}
function safeDownloadFileName(title, downloadURL) {
  const cleanTitle = String(title || "movie")
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "movie";

  let extension = ".mp4";

  try {
    const parsed = new URL(downloadURL);
    const lastPart =
      decodeURIComponent(
        parsed.pathname.split("/").pop() || ""
      );

    const extensionMatch =
      lastPart.match(/(\.[a-zA-Z0-9]{2,6})$/);

    if (extensionMatch) {
      extension = extensionMatch[1].toLowerCase();
    }
  } catch {
    // URL ထဲက extension မဖတ်နိုင်ရင် .mp4 သုံးမယ်။
  }

  return `${cleanTitle}${extension}`;
}

async function requireVipDownloadAccess(
  request,
  env
) {
  const result =
    await requireAuth(request, env);

  if (result.error) {
    return result;
  }

  const auth = result.auth;
  const now = Date.now();

  if (
    Number(auth.user.vipUntil || 0) <= now
  ) {
    return {
      error: json(
        {
          error: "vip_required",
          message:
            "Download လုပ်ရန် VIP လိုအပ်ပါသည်။"
        },
        403,
        {
          "cache-control": "no-store"
        }
      )
    };
  }

  if (!auth.sessionDeviceId) {
    return {
      error: json(
        {
          error: "device_id_required",
          message:
            "Device ID မရပါ။ Logout ထွက်ပြီး ပြန်ဝင်ပါ။"
        },
        409,
        {
          "cache-control": "no-store"
        }
      )
    };
  }

  if (!auth.user.vipDeviceId) {
    await env.DB.prepare(
      `UPDATE users
       SET vip_device_id = ?,
           updated_at = ?
       WHERE id = ?
         AND vip_device_id IS NULL`
    ).bind(
      auth.sessionDeviceId,
      now,
      auth.user.id
    ).run();

    const updated =
      await env.DB.prepare(
        `SELECT vip_device_id
         FROM users
         WHERE id = ?
         LIMIT 1`
      ).bind(
        auth.user.id
      ).first();

    if (
      updated?.vip_device_id !==
      auth.sessionDeviceId
    ) {
      return {
        error: json(
          {
            error: "vip_device_limit",
            message:
              "VIP account ကို တခြားဖုန်းတွင် အသုံးပြုနေပါသည်။"
          },
          409,
          {
            "cache-control": "no-store"
          }
        )
      };
    }
  } else if (
    auth.user.vipDeviceId !==
    auth.sessionDeviceId
  ) {
    return {
      error: json(
        {
          error: "vip_device_limit",
          message:
            "VIP account device မကိုက်ညီပါ။ Admin ကို device reset တောင်းပါ။"
        },
        409,
        {
          "cache-control": "no-store"
        }
      )
    };
  }

  return {
    auth
  };
}

async function protectedDownload(
  request,
  env
) {
  const body = await readBody(request);

  const titleId =
    String(body.titleId || "").trim();

  if (!titleId) {
    return json(
      {
        error: "Title ID မရှိပါ။"
      },
      400,
      {
        "cache-control": "no-store"
      }
    );
  }

  const title =
    await env.DB.prepare(
      `SELECT
         id,
         title,
         category,
         status,
         download_url
       FROM titles
       WHERE id = ?
         AND status = 'public'
       LIMIT 1`
    ).bind(
      titleId
    ).first();

  if (!title) {
    return json(
      {
        error: "ဇာတ်ကားမတွေ့ပါ။"
      },
      404,
      {
        "cache-control": "no-store"
      }
    );
  }

  /*
   * Movies မှာ Download မပေးပါ။
   * series = Free 18+
   * lugyi = VIP 18+
   */
  if (
    title.category !== "series" &&
    title.category !== "lugyi"
  ) {
    return json(
      {
        error: "ဒီဇာတ်ကားမှာ Download မရပါ။"
      },
      403,
      {
        "cache-control": "no-store"
      }
    );
  }

  const vip =
    await requireVipDownloadAccess(
      request,
      env
    );

  if (vip.error) {
    return vip.error;
  }

  const downloadURL =
    String(title.download_url || "").trim();

  if (!downloadURL) {
    return json(
      {
        error:
          "ဒီဇာတ်ကားအတွက် Download link မထည့်ရသေးပါ။"
      },
      404,
      {
        "cache-control": "no-store"
      }
    );
  }

  let parsedURL;

  try {
    parsedURL = new URL(downloadURL);
  } catch {
    return json(
      {
        error:
          "Download link URL မမှန်ပါ။"
      },
      500,
      {
        "cache-control": "no-store"
      }
    );
  }

  if (
    parsedURL.protocol !== "https:" &&
    parsedURL.protocol !== "http:"
  ) {
    return json(
      {
        error:
          "Download link protocol မမှန်ပါ။"
      },
      500,
      {
        "cache-control": "no-store"
      }
    );
  }

  return json(
    {
      ok: true,
      downloadUrl: parsedURL.toString(),
      fileName: safeDownloadFileName(
        title.title,
        parsedURL.toString()
      )
    },
    200,
    {
      "cache-control": "no-store"
    }
  );
}
async function adminListDownloads(
  request,
  env
) {
  const result =
    await requireAdmin(request, env);

  if (result.error) {
    return result.error;
  }

  const rows =
    await env.DB.prepare(
      `SELECT
         id,
         title,
         category,
         status,
         download_url,
         updated_at
       FROM titles
       WHERE category IN ('series', 'lugyi')
       ORDER BY
         updated_at DESC,
         created_at DESC
       LIMIT 500`
    ).all();

  return json(
    {
      items: rows.results || []
    },
    200,
    {
      "cache-control": "no-store"
    }
  );
}

async function adminUpdateDownload(
  request,
  env,
  titleId
) {
  const result =
    await requireAdmin(
      request,
      env,
      true
    );

  if (result.error) {
    return result.error;
  }

  const body = await readBody(request);

  const downloadURL =
    String(body.downloadUrl || "").trim();

  if (downloadURL) {
    let parsed;

    try {
      parsed = new URL(downloadURL);
    } catch {
      return json(
        {
          error:
            "Download URL format မမှန်ပါ။"
        },
        400
      );
    }

    if (
      parsed.protocol !== "https:" &&
      parsed.protocol !== "http:"
    ) {
      return json(
        {
          error:
            "http/https link သာထည့်ပါ။"
        },
        400
      );
    }
  }

  const title =
    await env.DB.prepare(
      `SELECT
         id,
         title,
         category
       FROM titles
       WHERE id = ?
       LIMIT 1`
    ).bind(
      titleId
    ).first();

  if (!title) {
    return json(
      {
        error: "ဇာတ်ကားမတွေ့ပါ။"
      },
      404
    );
  }

  if (
    title.category !== "series" &&
    title.category !== "lugyi"
  ) {
    return json(
      {
        error:
          "Movies category မှာ Download မထည့်ရပါ။"
      },
      400
    );
  }

  await env.DB.prepare(
    `UPDATE titles
     SET download_url = ?,
         updated_at = ?
     WHERE id = ?`
  ).bind(
    downloadURL,
    Date.now(),
    titleId
  ).run();

  return json({
    ok: true,
    id: title.id,
    title: title.title,
    downloadUrl: downloadURL
  });
}

async function protectedPlayback(
  request,
  env
) {
  const body = await readBody(request);

  const titleId =
    String(body.titleId || "").trim();

  const episodeId =
    String(body.episodeId || "").trim();

  if (!titleId) {
    return json(
      { error: "Title ID လိုအပ်ပါသည်" },
      400
    );
  }

  const title = await env.DB.prepare(
    `SELECT
       id,
       category,
       status,
       video_url,
       video_type
     FROM titles
     WHERE id = ?
       AND status = 'public'
     LIMIT 1`
  ).bind(titleId).first();

  if (!title) {
    return json(
      { error: "ဇာတ်ကားမတွေ့ပါ" },
      404
    );
  }

  /*
   * Movies/Series ဆို login/VIP မစစ်ပါ။
   * APK က လက်ရှိ direct URL ကိုဆက်သုံးနိုင်ပါတယ်။
   */
  if (title.category !== "lugyi") {
    return resolvePlaybackSource(
      env,
      title,
      episodeId
    );
  }

  const result =
    await requireAuth(request, env);

  if (result.error) {
    return result.error;
  }

  const auth = result.auth;
  const now = Date.now();

  if (
    Number(auth.user.vipUntil || 0) <= now
  ) {
    return json(
      {
        error: "vip_required",
        message:
          "18+ ကြည့်ရန် VIP လိုအပ်ပါသည်။"
      },
      403
    );
  }

  if (!auth.sessionDeviceId) {
    return json(
      {
        error: "device_id_required",
        message:
          "Device ID မရပါ။ Logout ထွက်ပြီး ပြန်ဝင်ပါ။"
      },
      409
    );
  }

  /*
   * VIP ပေးချိန်မှာ user login ဝင်ပြီးသားဖြစ်နေရင်
   * ပထမဆုံး play လုပ်သောဖုန်းကို bind လုပ်မယ်။
   */
  if (!auth.user.vipDeviceId) {
    await env.DB.prepare(
      `UPDATE users
       SET vip_device_id = ?,
           updated_at = ?
       WHERE id = ?
         AND vip_device_id IS NULL`
    ).bind(
      auth.sessionDeviceId,
      now,
      auth.user.id
    ).run();

    const updated =
      await env.DB.prepare(
        `SELECT vip_device_id
         FROM users
         WHERE id = ?`
      ).bind(
        auth.user.id
      ).first();

    if (
      updated?.vip_device_id !==
        auth.sessionDeviceId
    ) {
      return json(
        {
          error: "vip_device_limit",
          message:
            "VIP account ကို တခြားဖုန်းက အသုံးပြုနေပါသည်။"
        },
        409
      );
    }
  } else if (
    auth.user.vipDeviceId !==
      auth.sessionDeviceId
  ) {
    return json(
      {
        error: "vip_device_limit",
        message:
          "VIP account ကို တခြားဖုန်းက အသုံးပြုနေပါသည်။ Logout သို့မဟုတ် admin device reset လိုအပ်ပါသည်။"
      },
      409
    );
  }

  const playback =
    await resolvePlaybackSource(
      env,
      title,
      episodeId
    );

  playback.headers.set(
    "cache-control",
    "no-store"
  );

  return playback;
}

async function resolvePlaybackSource(
  env,
  title,
  episodeId
) {
  if (episodeId) {
    const episode =
      await env.DB.prepare(
        `SELECT video_url, video_type
         FROM episodes
         WHERE id = ?
           AND title_id = ?
         LIMIT 1`
      ).bind(
        episodeId,
        title.id
      ).first();

    if (!episode?.video_url) {
      return json(
        { error: "Episode video မတွေ့ပါ" },
        404,
        { "cache-control": "no-store" }
      );
    }

    return json(
      {
        ok: true,
        videoUrl: episode.video_url,
        videoType:
          episode.video_type || "auto"
      },
      200,
      { "cache-control": "no-store" }
    );
  }

  if (!title.video_url) {
    return json(
      { error: "Video link မရှိပါ" },
      404,
      { "cache-control": "no-store" }
    );
  }

  return json(
    {
      ok: true,
      videoUrl: title.video_url,
      videoType:
        title.video_type || "auto"
    },
    200,
    { "cache-control": "no-store" }
  );
}
async function adminSearchVipUsers(
  request,
  env
) {
  const result =
    await requireAdmin(request, env);

  if (result.error) {
    return result.error;
  }

  const url = new URL(request.url);
  const query =
    String(url.searchParams.get("q") || "")
      .trim()
      .slice(0, 100);

  if (query.length < 2) {
    return json({
      items: []
    });
  }

  const prefix = `${query}%`;

  const rows = await env.DB.prepare(
    `SELECT
       id,
       username,
       email,
       status,
       vip_until,
       vip_device_id,
       created_at
     FROM users
     WHERE role = 'user'
       AND (
         username LIKE ? COLLATE NOCASE
         OR email LIKE ? COLLATE NOCASE
       )
     ORDER BY username ASC
     LIMIT 30`
  ).bind(
    prefix,
    prefix
  ).all();

  const now = Date.now();

  return json({
    items:
      (rows.results || []).map(user => ({
        id: user.id,
        username: user.username,
        email: user.email,
        status: user.status,
        vipUntil:
          Number(user.vip_until || 0),
        isVip:
          Number(user.vip_until || 0) > now,
        vipDeviceBound:
          Boolean(user.vip_device_id)
      }))
  });
}

async function adminExtendVip(
  request,
  env,
  userId
) {
  const result =
    await requireAdmin(request, env, true);

  if (result.error) {
    return result.error;
  }

  const body = await readBody(request);
  const days = Math.floor(
    Number(body.days || 0)
  );

  if (
    !Number.isFinite(days) ||
    days < 1 ||
    days > 3650
  ) {
    return json(
      {
        error:
          "VIP days သည် 1 မှ 3650 အတွင်းဖြစ်ရပါမည်"
      },
      400
    );
  }

  const user = await env.DB.prepare(
    `SELECT id, vip_until
     FROM users
     WHERE id = ?
       AND role = 'user'
     LIMIT 1`
  ).bind(userId).first();

  if (!user) {
    return json(
      { error: "User မတွေ့ပါ" },
      404
    );
  }

  const now = Date.now();
  const oldVipUntil =
    Number(user.vip_until || 0);

  const base =
    Math.max(now, oldVipUntil);

  const vipUntil =
    base + days * 86400000;

  await env.DB.prepare(
    `UPDATE users
     SET vip_until = ?,
         vip_device_id =
           CASE
             WHEN vip_until <= ?
             THEN NULL
             ELSE vip_device_id
           END,
         updated_at = ?
     WHERE id = ?`
  ).bind(
    vipUntil,
    now,
    now,
    userId
  ).run();

  return json({
    ok: true,
    vipUntil
  });
}

async function adminResetVipDevice(
  request,
  env,
  userId
) {
  const result =
    await requireAdmin(request, env, true);

  if (result.error) {
    return result.error;
  }

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE users
       SET vip_device_id = NULL,
           updated_at = ?
       WHERE id = ?
         AND role = 'user'`
    ).bind(
      Date.now(),
      userId
    ),

    env.DB.prepare(
      `DELETE FROM sessions
       WHERE user_id = ?`
    ).bind(userId)
  ]);

  return json({
    ok: true,
    message:
      "Device reset ပြီးပါပြီ။ User ပြန် login ဝင်ရပါမည်။"
  });
}

async function adminCancelVip(
  request,
  env,
  userId
) {
  const result =
    await requireAdmin(
      request,
      env,
      true
    );

  if (result.error) {
    return result.error;
  }

  const user =
    await env.DB.prepare(
      `SELECT
         id,
         username,
         role
       FROM users
       WHERE id = ?
       LIMIT 1`
    )
      .bind(userId)
      .first();

  if (!user) {
    return json(
      {
        error: "User မတွေ့ပါ"
      },
      404
    );
  }

  if (user.role === "admin") {
    return json(
      {
        error:
          "Admin account VIP ကို ပယ်ဖျက်၍မရပါ"
      },
      400
    );
  }

  const now = Date.now();

  /*
   * VIP status နဲ့ VIP device binding ပဲရှင်းမယ်။
   * sessions table ကို လုံးဝမဖျက်ပါ။
   * ဒါကြောင့် user account auto logout မဖြစ်ပါ။
   */
  await env.DB.prepare(
    `UPDATE users
     SET vip_until = 0,
         vip_device_id = NULL,
         updated_at = ?
     WHERE id = ?`
  )
    .bind(
      now,
      userId
    )
    .run();

  return json({
    ok: true,
    message:
      `${user.username} ၏ VIP ကို ပယ်ဖျက်ပြီးပါပြီ။`,
    user: {
      id: user.id,
      username: user.username,
      vipUntil: 0,
      isVip: false,
      vipDeviceBound: false
    }
  });
}
