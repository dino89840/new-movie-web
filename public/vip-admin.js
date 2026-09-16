const loginCard =
  document.querySelector("#loginCard");

const adminCard =
  document.querySelector("#adminCard");

const promoCard =
  document.querySelector("#promoCard");

const message =
  document.querySelector("#message");

const results =
  document.querySelector("#results");

const generatedCode =
  document.querySelector("#generatedCode");

const copyPromoButton =
  document.querySelector("#copyPromoButton");

let csrf = "";
let currentPromoCode = "";

function showMessage(text, error = false) {
  message.hidden = false;

  message.style.color =
    error
      ? "#ffb4ab"
      : "#8ff0a4";

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

function planLabel(months) {
  const value = Number(months || 0);

  if (value === 1) {
    return "1 Month";
  }

  if (value > 1) {
    return `${value} Months`;
  }

  return "Free Plan";
}

async function api(path, options = {}) {
  const headers = {
    ...(options.body
      ? {
          "content-type":
            "application/json"
        }
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

  const response =
    await fetch(
      `/api/${path}`,
      {
        credentials: "same-origin",
        ...options,
        headers
      }
    );

  const data =
    await response
      .json()
      .catch(() => ({}));

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
    const data =
      await api("auth/me");

    if (
      data.user?.role === "admin"
    ) {
      csrf = data.csrf || "";

      adminCard.hidden = false;
      promoCard.hidden = false;

      return;
    }

    loginCard.hidden = false;
  } catch (error) {
    showMessage(
      error.message,
      true
    );
  }
}

document
  .querySelector("#loginButton")
  .addEventListener(
    "click",
    async () => {
      try {
        const identity =
          document
            .querySelector("#identity")
            .value
            .trim();

        const password =
          document
            .querySelector("#password")
            .value;

        const data =
          await api(
            "auth/login",
            {
              method: "POST",
              body: JSON.stringify({
                identity,
                password,
                turnstileToken: "",
                deviceId:
                  "cmflix-web-admin-panel"
              })
            }
          );

        if (
          data.user?.role !== "admin"
        ) {
          throw new Error(
            "Admin account မဟုတ်ပါ"
          );
        }

        csrf = data.csrf || "";

        loginCard.hidden = true;
        adminCard.hidden = false;
        promoCard.hidden = false;

        showMessage(
          "Admin login အောင်မြင်ပါသည်"
        );
      } catch (error) {
        showMessage(
          error.message,
          true
        );
      }
    }
  );

document
  .querySelector("#searchButton")
  .addEventListener(
    "click",
    searchUsers
  );

document
  .querySelector("#search")
  .addEventListener(
    "keydown",
    event => {
      if (event.key === "Enter") {
        searchUsers();
      }
    }
  );

document
  .querySelector("#createPromoButton")
  .addEventListener(
    "click",
    createPromoCode
  );

copyPromoButton
  .addEventListener(
    "click",
    async () => {
      if (!currentPromoCode) {
        return;
      }

      try {
        await navigator.clipboard
          .writeText(currentPromoCode);

        showMessage(
          "Promo Code copy လုပ်ပြီးပါပြီ"
        );
      } catch {
        showMessage(
          "Copy မလုပ်နိုင်ပါ။ Code ကို လက်ဖြင့် copy လုပ်ပါ။",
          true
        );
      }
    }
  );

async function searchUsers() {
  try {
    const query =
      document
        .querySelector("#search")
        .value
        .trim();

    if (query.length < 2) {
      throw new Error(
        "အနည်းဆုံး စာလုံး 2 လုံးထည့်ပါ"
      );
    }

    const data =
      await api(
        `admin/vip-users?q=${
          encodeURIComponent(query)
        }`
      );

    renderUsers(
      data.items || []
    );
  } catch (error) {
    showMessage(
      error.message,
      true
    );
  }
}

function renderUsers(users) {
  if (!users.length) {
    results.innerHTML =
      `<p class="muted">User မတွေ့ပါ</p>`;

    return;
  }

  results.innerHTML =
    users.map(user => {
      const expiry =
        user.vipUntil
          ? new Date(
              user.vipUntil
            ).toLocaleString()
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
            Plan:
            <strong>
              ${
                user.isVip
                  ? escapeHTML(
                      planLabel(
                        user.planMonths
                      )
                    )
                  : "Free Plan"
              }
            </strong>
          </p>

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
            <select
              id="plan-${escapeHTML(user.id)}"
            >
              <option value="1">
                1 Month
              </option>

              <option value="3">
                3 Months
              </option>

              <option value="6">
                6 Months
              </option>

              <option value="12">
                12 Months
              </option>
            </select>

            <button
              class="primary"
              data-action="extend"
              data-id="${escapeHTML(user.id)}"
            >
              VIP ထည့်မည်
            </button>

            <button
              data-action="reset-device"
              data-id="${escapeHTML(user.id)}"
            >
              Device Reset
            </button>

            <button
              class="danger"
              data-action="cancel"
              data-id="${escapeHTML(user.id)}"
            >
              VIP ပယ်ဖျက်
            </button>
          </div>
        </div>
      `;
    }).join("");

  results
    .querySelectorAll(
      "[data-action]"
    )
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

async function runAction(
  userId,
  action
) {
  try {
    let body = {};

    if (action === "extend") {
      const select =
        document.querySelector(
          `#plan-${CSS.escape(userId)}`
        );

      body = {
        planMonths:
          Number(select.value)
      };
    }

    if (
      action === "cancel" &&
      !confirm(
        "VIP ပယ်ဖျက်မှာ သေချာပါသလား?"
      )
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

    const data =
      await api(
        `admin/vip-users/${
          encodeURIComponent(userId)
        }/${action}`,
        {
          method: "POST",
          body:
            JSON.stringify(body)
        }
      );

    showMessage(
      data.message ||
      "အောင်မြင်ပါသည်"
    );

    await searchUsers();
  } catch (error) {
    showMessage(
      error.message,
      true
    );
  }
}

async function createPromoCode() {
  try {
    const planMonths =
      Number(
        document
          .querySelector("#promoPlan")
          .value
      );

    const maxRedemptions =
      Number(
        document
          .querySelector("#promoMaxUses")
          .value
      );

    const expiresInDays =
      Number(
        document
          .querySelector("#promoExpiryDays")
          .value
      );

    const data =
      await api(
        "admin/promo-codes",
        {
          method: "POST",
          body: JSON.stringify({
            planMonths,
            maxRedemptions,
            expiresInDays
          })
        }
      );

    currentPromoCode =
      data.code || "";

    generatedCode.hidden = false;
    generatedCode.textContent =
      currentPromoCode;

    copyPromoButton.hidden =
      !currentPromoCode;

    showMessage(
      `${data.message}\nPlan: ${
        planLabel(data.planMonths)
      }\nMax uses: ${
        data.maxRedemptions
      }\nExpired: ${
        new Date(
          data.expiresAt
        ).toLocaleString()
      }`
    );
  } catch (error) {
    showMessage(
      error.message,
      true
    );
  }
}

initialize();
