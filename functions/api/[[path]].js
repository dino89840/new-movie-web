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

    if (path === "admin/tmdb/search" && method === "GET") {
      return tmdbSearch(request, env);
    }

    if (path === "admin/images/proxy" && method === "GET") {
      return adminImageProxy(request, env);
    }

    if (path === "admin/images/upload" && method === "POST") {
      return adminForwardImageUpload(request, env);
    }

    if (path === "admin/titles" && method === "GET") {
      return adminTitles(request, env);
    }

    if (path === "admin/titles" && method === "POST") {
      return adminCreateTitle(request, env);
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

async function createSession(env, userId) {
  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const csrf = randomToken(24);
  const now = Date.now();
  const days = Math.max(1, Number(env.SESSION_DAYS || 30));
  const expiresAt = now + days * 86400000;

  await env.DB.prepare(
    `INSERT INTO sessions
     (token_hash, user_id, csrf_token, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(tokenHash, userId, csrf, expiresAt, now).run();

  return { token, csrf, expiresAt };
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
  const token = parseCookies(request)[SESSION_COOKIE];

  if (!token) return null;

  const tokenHash = await sha256(token);

  const row = await env.DB.prepare(
    `SELECT
       s.token_hash,
       s.csrf_token,
       s.expires_at,
       u.id,
       u.username,
       u.email,
       u.role,
       u.status
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?
       AND s.expires_at > ?`
  ).bind(tokenHash, Date.now()).first();

  if (!row || row.status !== "active") return null;

  return {
    tokenHash: row.token_hash,
    csrf: row.csrf_token,
    user: {
      id: row.id,
      username: row.username,
      email: row.email,
      role: row.role
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

  const session = await createSession(env, id);

  return json(
    {
      ok: true,
      csrf: session.csrf,
      user: { id, username, email, role }
    },
    201,
    {
      "set-cookie": sessionCookie(session.token, session.expiresAt)
    }
  );
}

async function login(request, env) {
  if (!rateLimit(request, "login", 10, 5 * 60000)) {
    return json({ error: "Login အကြိမ်များလွန်းပါသည်" }, 429);
  }

  const body = await readBody(request);

  if (!(await verifyTurnstile(request, env, body.turnstileToken))) {
    return json({ error: "Turnstile verification မအောင်မြင်ပါ" }, 400);
  }

  const identity = String(body.identity || "").trim();
  const password = String(body.password || "");

  const user = await env.DB.prepare(
    `SELECT * FROM users
     WHERE username = ? COLLATE NOCASE
        OR email = ? COLLATE NOCASE
     LIMIT 1`
  ).bind(identity, normalizeEmail(identity)).first();

  if (!user || user.status !== "active") {
    return json({ error: "Login information မှားနေပါသည်" }, 401);
  }

  const passwordData = await hashPassword(
    password,
    user.password_salt,
    user.password_iterations
  );

  if (!safeEqual(passwordData.hash, user.password_hash)) {
    return json({ error: "Login information မှားနေပါသည်" }, 401);
  }

  const session = await createSession(env, user.id);

  return json(
    {
      ok: true,
      csrf: session.csrf,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    },
    200,
    {
      "set-cookie": sessionCookie(session.token, session.expiresAt)
    }
  );
}

async function logout(request, env) {
  const auth = await getAuth(request, env);

  if (auth) {
    const csrf = request.headers.get("x-csrf-token") || "";

    if (!safeEqual(csrf, auth.csrf)) {
      return json({ error: "CSRF token မှားနေပါသည်" }, 403);
    }

    await env.DB.prepare(
      "DELETE FROM sessions WHERE token_hash = ?"
    ).bind(auth.tokenHash).run();
  }

  return json(
    { ok: true },
    200,
    { "set-cookie": clearSessionCookie() }
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
            ? `https://image.tmdb.org/t/p/w185${person.profile_path}`
            : ""
        }))
    };
  } catch (error) {
    console.error("TMDB details error:", error);
    return null;
  }
}
async function publicTitles(request, env, context) {
  const url = new URL(request.url);
  const category = url.searchParams.get("category") || "movies";
  const search = String(url.searchParams.get("q") || "")
    .trim()
    .slice(0, 50);

  const page = Math.max(
    1,
    Number(url.searchParams.get("page") || 1)
  );

  const limit = 18;
  const offset = (page - 1) * limit;

  if (!["movies", "series", "lugyi"].includes(category)) {
    return json({ error: "Category မှားနေပါသည်" }, 400);
  }

  const cache = caches.default;
  const cacheURL = new URL(url.toString());

  // အဟောင်း cache နဲ့မရောစေရန်
  cacheURL.searchParams.set("_dataVersion", "2");

  const cacheKey = new Request(cacheURL.toString(), {
    method: "GET"
  });

  const cached = await cache.match(cacheKey);

  if (cached) {
    return cached;
  }

  let query = `
    SELECT
      id, slug, tmdb_id, tmdb_type, category, title,
      original_title, overview, poster_url, backdrop_url,
      release_date, year, rating, genres, featured,
      created_at, updated_at
    FROM titles
    WHERE status='public' AND category=?
  `;

  const params = [category];

  if (search) {
    query += " AND (title LIKE ? OR original_title LIKE ?)";
    params.push(`%${search}%`, `%${search}%`);
  }

  query += `
    ORDER BY featured DESC, created_at DESC
    LIMIT ? OFFSET ?
  `;

  params.push(limit, offset);

  const result = await env.DB
    .prepare(query)
    .bind(...params)
    .all();

  const databaseItems = result.results || [];

  /*
   * Database ထဲ genres မရှိသေးတဲ့ အဟောင်းကားတွေကို
   * TMDB ကနေ genre ပြန်ယူပေးပါတယ်။
   */
  const items = await Promise.all(
    databaseItems.map(async item => {
      if (
        String(item.genres || "").trim() ||
        !item.tmdb_id
      ) {
        return item;
      }

      const tmdb = await fetchTMDBDetails(
        env,
        item.tmdb_type,
        item.tmdb_id
      );

      return {
        ...item,
        genres: tmdb?.genres || ""
      };
    })
  );

  const response = json(
    {
      items,
      page,
      hasMore: databaseItems.length === limit
    },
    200,
    {
      "cache-control":
        "public, max-age=30, s-maxage=300, stale-while-revalidate=600"
    }
  );

  context.waitUntil(
    cache.put(cacheKey, response.clone())
  );

  return response;
}


async function publicTitle(request, env, slug, context) {
  const cache = caches.default;
  const cacheURL = new URL(request.url);

  // အဟောင်း cast မပါတဲ့ cache ကိုရှောင်ရန်
  cacheURL.searchParams.set("_dataVersion", "2");

  const cacheKey = new Request(cacheURL.toString(), {
    method: "GET"
  });

  const cached = await cache.match(cacheKey);

  if (cached) {
    return cached;
  }

  const title = await env.DB.prepare(
    `SELECT *
     FROM titles
     WHERE slug=? AND status='public'
     LIMIT 1`
  )
    .bind(slug)
    .first();

  if (!title) {
    return json({ error: "ဇာတ်ကားမတွေ့ပါ" }, 404);
  }

  const episodes = await env.DB.prepare(
    `SELECT
       id,
       season_number,
       episode_number,
       episode_title,
       video_url,
       video_type
     FROM episodes
     WHERE title_id=?
     ORDER BY season_number, episode_number`
  )
    .bind(title.id)
    .all();

  const tmdb = title.tmdb_id
    ? await fetchTMDBDetails(
        env,
        title.tmdb_type,
        title.tmdb_id
      )
    : null;

  const item = {
    ...title,

    // DB ထဲမှာ genre ရှိရင် DB ကိုသုံးမယ်။
    // မရှိရင် TMDB က genre ကိုသုံးမယ်။
    genres:
      String(title.genres || "").trim() ||
      tmdb?.genres ||
      "",

    cast: tmdb?.cast || [],
    episodes: episodes.results || []
  };

  const response = json(
    { item },
    200,
    {
      "cache-control":
        "public, max-age=30, s-maxage=300, stale-while-revalidate=600"
    }
  );

  context.waitUntil(
    cache.put(cacheKey, response.clone())
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

  return json({ items: rows.results || [] });
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
          ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
          : "",

        backdrop_url: item.backdrop_path
          ? `https://image.tmdb.org/t/p/original${item.backdrop_path}`
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

  const rows = await env.DB.prepare(sql).bind(...params).all();
  return json({ items: rows.results || [] });
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
async function adminImageProxy(request, env) {
  const admin = await requireAdmin(request, env);

  if (admin.error) {
    return admin.error;
  }

  const requestURL =
    new URL(request.url);

  const sourceURL =
    requestURL.searchParams.get("url") || "";

  let targetURL;

  try {
    targetURL = new URL(sourceURL);
  } catch {
    return json(
      { error: "Image URL မမှန်ပါ" },
      400
    );
  }

  /*
   * Internal network URL တွေကို proxy ခေါ်၍မရအောင်
   * TMDB image host တစ်ခုတည်းကိုသာ ခွင့်ပြုထားပါတယ်။
   */
  if (
    targetURL.protocol !== "https:" ||
    targetURL.hostname !== "image.tmdb.org"
  ) {
    return json(
      { error: "TMDB image URL မဟုတ်ပါ" },
      403
    );
  }

  const response =
    await fetch(targetURL.toString(), {
      headers: {
        accept:
          "image/avif,image/webp,image/jpeg,image/png,image/*"
      },
      cf: {
        cacheEverything: true,
        cacheTtl: 86400
      }
    });

  if (!response.ok) {
    return json(
      {
        error:
          `TMDB image download failed: ${response.status}`
      },
      502
    );
  }

  const contentType =
    response.headers.get("content-type") ||
    "image/jpeg";

  if (
    !contentType
      .toLowerCase()
      .startsWith("image/")
  ) {
    return json(
      { error: "TMDB response သည် image မဟုတ်ပါ" },
      502
    );
  }

  return new Response(
    response.body,
    {
      status: 200,
      headers: {
        "content-type": contentType,
        "cache-control":
          "private, max-age=3600",
        "x-content-type-options": "nosniff"
      }
    }
  );
}

async function adminForwardImageUpload(request, env) {
  const admin =
    await requireAdmin(request, env, true);

  if (admin.error) {
    return admin.error;
  }

  if (
    !env.IMG_UPLOAD_ENDPOINT ||
    !env.IMG_UPLOAD_API_KEY
  ) {
    return json(
      {
        error:
          "IMG_UPLOAD_ENDPOINT သို့မဟုတ် IMG_UPLOAD_API_KEY မသတ်မှတ်ရသေးပါ"
      },
      500
    );
  }

  const incomingFormData =
    await request.formData();

  const file =
    incomingFormData.get("file");

  const kind = String(
    incomingFormData.get("kind") || "image"
  );

  if (
    !file ||
    typeof file.arrayBuffer !== "function"
  ) {
    return json(
      { error: "Image file မပါပါ" },
      400
    );
  }

  if (
    Number(file.size || 0) >
    10 * 1024 * 1024
  ) {
    return json(
      { error: "ပုံဖိုင်သည် 10 MB ထက်ကြီးနေပါသည်" },
      413
    );
  }

  const outgoingFormData =
    new FormData();

  outgoingFormData.append(
    "file",
    file,
    file.name || "tmdb-image.webp"
  );

  outgoingFormData.append(
    "kind",
    kind
  );

  const uploadResponse =
    await fetch(
      String(env.IMG_UPLOAD_ENDPOINT),
      {
        method: "POST",
        headers: {
          authorization:
            `Bearer ${env.IMG_UPLOAD_API_KEY}`
        },
        body: outgoingFormData
      }
    );

  const result =
    await uploadResponse
      .json()
      .catch(() => ({}));

  if (!uploadResponse.ok) {
    return json(
      {
        error:
          result.error ||
          `Image uploader error: ${uploadResponse.status}`
      },
      uploadResponse.status >= 400 &&
      uploadResponse.status < 600
        ? uploadResponse.status
        : 502
    );
  }

  if (!result.url) {
    return json(
      {
        error:
          "Image uploader က URL ပြန်မပေးပါ"
      },
      502
    );
  }

  return json({
    ok: true,
    key: result.key || "",
    url: result.url
  });
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
