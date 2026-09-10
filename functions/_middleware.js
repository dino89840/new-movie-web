const encoder = new TextEncoder();

function safeEqual(firstValue, secondValue) {
  const first = encoder.encode(String(firstValue || ""));
  const second = encoder.encode(String(secondValue || ""));

  if (first.length !== second.length) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < first.length; index++) {
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
    const encoded = authorization.slice(6).trim();
    const decoded = atob(encoded);
    const separator = decoded.indexOf(":");

    if (separator < 0) {
      return null;
    }

    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1)
    };
  } catch {
    return null;
  }
}

function unauthorized(isApi) {
  if (isApi) {
    return new Response(
      JSON.stringify({
        error: "Website/API access denied"
      }),
      {
        status: 401,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff"
        }
      }
    );
  }

  return new Response(
    "CMFLIX ကိုအသုံးပြုရန် username နှင့် password လိုအပ်ပါသည်။",
    {
      status: 401,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "www-authenticate": 'Basic realm="CMFLIX", charset="UTF-8"',
        "cache-control": "no-store",
        "x-content-type-options": "nosniff"
      }
    }
  );
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const isApi = url.pathname.startsWith("/api/");

  /*
   * APK က x-cmflix-app-key header ဖြင့် API သုံးမယ်။
   * Static web files ကို ဒီ key နဲ့ဖွင့်ခွင့်မပေးပါ။
   */
  if (isApi) {
    const appKey =
      request.headers.get("x-cmflix-app-key") || "";

    if (
      env.CMFLIX_APP_KEY &&
      safeEqual(appKey, env.CMFLIX_APP_KEY)
    ) {
      return context.next();
    }
  }

  /*
   * Browser က Basic Authentication သုံးမယ်။
   * Browser မှန်ကန်စွာ login ဝင်ထားရင်
   * static files နဲ့ /api နှစ်ခုလုံး သုံးနိုင်မယ်။
   */
  const basic = readBasicAuth(request);

  if (
    basic &&
    env.WEB_USERNAME &&
    env.WEB_PASSWORD &&
    safeEqual(basic.username, env.WEB_USERNAME) &&
    safeEqual(basic.password, env.WEB_PASSWORD)
  ) {
    return context.next();
  }

  return unauthorized(isApi);
}
