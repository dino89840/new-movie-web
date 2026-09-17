const encoder = new TextEncoder();

/*
 * APK က အသုံးပြုခွင့်ရှိသော API routes များ။
 *
 * /api/admin/* နှင့် /api/setup ကို App Key တစ်ခုတည်းဖြင့်
 * လုံးဝမဖွင့်ပေးပါ။
 */
function isAllowedAppApi(pathname, method) {
  const path = pathname.replace(/^\/api\/?/, "");

  if (
    method === "GET" &&
    (
      path === "status" ||
      path === "bootstrap" ||
      path === "auth/me" ||
      path === "titles" ||
      path.startsWith("titles/") ||
      path === "favorites" ||
      path.startsWith("favorites/")
    )
  ) {
    return true;
  }

  if (
    method === "POST" &&
    (
      path === "auth/register" ||
      path === "auth/login" ||
      path === "auth/logout" ||
      path === "account/password" ||
      path === "account/promo/redeem" ||
      path === "play" ||
      path === "download" ||
      path.startsWith("favorites/")
    )
  ) {
    return true;
  }

  if (
    method === "DELETE" &&
    path.startsWith("favorites/")
  ) {
    return true;
  }

  return false;
}

function safeEqual(firstValue, secondValue) {
  const first = encoder.encode(
    String(firstValue || "")
  );

  const second = encoder.encode(
    String(secondValue || "")
  );

  if (first.length !== second.length) {
    return false;
  }

  let difference = 0;

  for (
    let index = 0;
    index < first.length;
    index++
  ) {
    difference |= first[index] ^ second[index];
  }

  return difference === 0;
}

function readBasicAuth(request) {
  const authorization =
    request.headers.get("authorization") || "";

  if (!authorization.startsWith("Basic ")) {
    return null;
  }

  try {
    const encoded =
      authorization.slice(6).trim();

    const decoded = atob(encoded);
    const separator = decoded.indexOf(":");

    if (separator < 0) {
      return null;
    }

    return {
      username:
        decoded.slice(0, separator),

      password:
        decoded.slice(separator + 1)
    };
  } catch {
    return null;
  }
}

function unauthorized(isApi) {
  const commonHeaders = {
    "cache-control":
      "no-store, max-age=0",

    "x-content-type-options":
      "nosniff",

    "referrer-policy":
      "no-referrer"
  };

  if (isApi) {
    return new Response(
      JSON.stringify({
        error: "access_denied",
        message:
          "Website/API access denied"
      }),
      {
        status: 401,
        headers: {
          ...commonHeaders,
          "content-type":
            "application/json; charset=utf-8"
        }
      }
    );
  }

  return new Response(
    "CMFLIX Admin ကိုအသုံးပြုရန် username နှင့် password လိုအပ်ပါသည်။",
    {
      status: 401,
      headers: {
        ...commonHeaders,

        "content-type":
          "text/plain; charset=utf-8",

        "www-authenticate":
          'Basic realm="CMFLIX Admin", charset="UTF-8"'
      }
    }
  );
}

function withSecurityHeaders(
  response,
  isApi
) {
  const headers =
    new Headers(response.headers);

  headers.set(
    "x-content-type-options",
    "nosniff"
  );

  headers.set(
    "referrer-policy",
    "strict-origin-when-cross-origin"
  );

  headers.set(
    "permissions-policy",
    "camera=(), microphone=(), geolocation=()"
  );

  headers.set(
    "x-frame-options",
    "DENY"
  );

  headers.set(
    "cross-origin-opener-policy",
    "same-origin"
  );

  headers.set(
    "strict-transport-security",
    "max-age=31536000"
  );

  /*
   * Web admin HTML ကို browser/proxy cache ထဲ
   * မသိမ်းစေရန်။
   *
   * API response ရဲ့ cache-control ကိုတော့ API handler
   * သတ်မှတ်ထားသလို ဆက်ထားမယ်။
   */
  if (!isApi) {
    headers.set(
      "cache-control",
      "private, no-store, max-age=0"
    );
  }

  return new Response(
    response.body,
    {
      status: response.status,
      statusText: response.statusText,
      headers
    }
  );
}

export async function onRequest(context) {
  const { request, env } = context;

  const url = new URL(request.url);
  const method =
    request.method.toUpperCase();

  const isApi =
    url.pathname.startsWith("/api/");

  /*
   * APK က App Key ဖြင့် public/user API များသာ
   * အသုံးပြုနိုင်မည်။
   *
   * App Key မှန်သော်လည်း /api/admin/* နှင့်
   * /api/setup ကို ကျော်ခွင့်မပေးပါ။
   */
  if (
    isApi &&
    isAllowedAppApi(
      url.pathname,
      method
    )
  ) {
    const appKey =
      request.headers.get(
        "x-cmflix-app-key"
      ) || "";

    if (
      env.CMFLIX_APP_KEY &&
      safeEqual(
        appKey,
        env.CMFLIX_APP_KEY
      )
    ) {
      const response =
        await context.next();

      return withSecurityHeaders(
        response,
        true
      );
    }
  }

  /*
   * Admin browser ဝင်ရောက်မှု။
   *
   * Basic Auth မှန်မှ static admin pages နှင့်
   * admin APIs သုံးနိုင်မည်။
   */
  const basic =
    readBasicAuth(request);

  if (
    basic &&
    env.WEB_USERNAME &&
    env.WEB_PASSWORD &&
    safeEqual(
      basic.username,
      env.WEB_USERNAME
    ) &&
    safeEqual(
      basic.password,
      env.WEB_PASSWORD
    )
  ) {
    const response =
      await context.next();

    return withSecurityHeaders(
      response,
      isApi
    );
  }

  return unauthorized(isApi);
}
