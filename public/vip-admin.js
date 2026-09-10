const loginCard =
  document.querySelector("#loginCard");

const adminCard =
  document.querySelector("#adminCard");

const message =
  document.querySelector("#message");

const results =
  document.querySelector("#results");

let csrf = "";

function showMessage(text, error = false) {
  message.hidden = false;
  message.style.color =
    error ? "#ffb4ab" : "#8ff0a4";
  message.textContent = text;
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function api(path, options = {}) {
  const headers = {
    ...(options.body
      ? { "content-type": "application/json" }
      : {}),
    ...(options.headers || {})
  };

  if (
    csrf &&
    options.method &&
    options.method !== "GET"
  ) {
    headers["x-csrf-token"] = csrf;
  }

  const response = await fetch(
    `/api/${path}`,
    {
      credentials: "same-origin",
      ...options,
      headers
    }
  );

  const data =
    await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.message ||
      data.error ||
      "Request failed"
    );
  }

  return data;
}

async function initialize() {
  try {
    const data = await api("auth/me");

    if (data.user?.role === "admin") {
      csrf = data.csrf || "";
      adminCard.hidden = false;
      return;
    }

    loginCard.hidden = false;
  } catch (error) {
    showMessage(error.message, true);
  }
}

document
  .querySelector("#loginButton")
  .addEventListener("click", async () => {
    try {
      const identity =
        document.querySelector("#identity")
          .value.trim();

      const password =
        document.querySelector("#password")
          .value;

      const data = await api(
        "auth/login",
        {
          method: "POST",
          body: JSON.stringify({
            identity,
            password,
            turnstileToken: "",
            deviceId: "cmflix-web-admin-panel"
          })
        }
      );

      if (data.user?.role !== "admin") {
        throw new Error(
          "Admin account မဟုတ်ပါ"
        );
      }

      csrf = data.csrf || "";
      loginCard.hidden = true;
      adminCard.hidden = false;

      showMessage(
        "Admin login အောင်မြင်ပါသည်"
      );
    } catch (error) {
      showMessage(error.message, true);
    }
  });

document
  .querySelector("#searchButton")
  .addEventListener("click", searchUsers);

document
  .querySelector("#search")
  .addEventListener("keydown", event => {
    if (event.key === "Enter") {
      searchUsers();
    }
  });

async function searchUsers() {
  try {
    const query =
      document.querySelector("#search")
        .value.trim();

    if (query.length < 2) {
      throw new Error(
        "အနည်းဆုံး စာလုံး 2 လုံးထည့်ပါ"
      );
    }

    const data = await api(
      `admin/vip-users?q=${
        encodeURIComponent(query)
      }`
    );

    renderUsers(data.items || []);
  } catch (error) {
    showMessage(error.message, true);
  }
}

function renderUsers(users) {
  if (!users.length) {
    results.innerHTML =
      `<p class="muted">User မတွေ့ပါ</p>`;
    return;
  }

  results.innerHTML = users.map(user => {
    const expiry = user.vipUntil
      ? new Date(user.vipUntil)
          .toLocaleString()
      : "VIP မရှိ";

    return `
      <div class="user">
        <strong>
          ${escapeHTML(user.username)}
        </strong>

        <div class="muted">
          ${escapeHTML(user.email)}
        </div>

        <p>
          VIP:
          ${
            user.isVip
              ? `Active — ${escapeHTML(expiry)}`
              : "Inactive"
          }
        </p>

        <p>
          Device:
          ${
            user.vipDeviceBound
              ? "ချိတ်ထားသည်"
              : "မချိတ်ရသေး"
          }
        </p>

        <div class="actions">
          <input
            class="days"
            id="days-${user.id}"
            type="number"
            min="1"
            max="3650"
            value="30"
          >

          <button
            class="primary"
            data-action="extend"
            data-id="${user.id}"
          >
            VIP တိုးမည်
          </button>

          <button
            data-action="reset-device"
            data-id="${user.id}"
          >
            Device Reset
          </button>

          <button
            class="danger"
            data-action="cancel"
            data-id="${user.id}"
          >
            VIP ပယ်ဖျက်
          </button>
        </div>
      </div>
    `;
  }).join("");

  results
    .querySelectorAll("[data-action]")
    .forEach(button => {
      button.addEventListener(
        "click",
        () => runAction(
          button.dataset.id,
          button.dataset.action
        )
      );
    });
}

async function runAction(userId, action) {
  try {
    let body = {};

    if (action === "extend") {
      const days = Number(
        document.querySelector(
          `#days-${CSS.escape(userId)}`
        ).value
      );

      body = { days };
    }

    if (
      action === "cancel" &&
      !confirm("VIP ပယ်ဖျက်မှာ သေချာပါသလား?")
    ) {
      return;
    }

    if (
      action === "reset-device" &&
      !confirm(
        "Device reset လုပ်လျှင် user logout ဖြစ်ပါမည်။ ဆက်လုပ်မလား?"
      )
    ) {
      return;
    }

    const data = await api(
      `admin/vip-users/${
        encodeURIComponent(userId)
      }/${action}`,
      {
        method: "POST",
        body: JSON.stringify(body)
      }
    );

    showMessage(
      data.message ||
      "အောင်မြင်ပါသည်"
    );

    await searchUsers();
  } catch (error) {
    showMessage(error.message, true);
  }
}

initialize();
