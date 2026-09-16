const loginCard =
  document.querySelector("#loginCard");

const adminCard =
  document.querySelector("#adminCard");

const promoCard =
  document.querySelector("#promoCard");

const passwordResetCard =
  document.querySelector(
    "#passwordResetCard"
  );

const resetUserDetails =
  document.querySelector(
    "#resetUserDetails"
  );

const newUserPassword =
  document.querySelector(
    "#newUserPassword"
  );

const confirmAdminPassword =
  document.querySelector(
    "#confirmAdminPassword"
  );

const confirmPasswordResetButton =
  document.querySelector(
    "#confirmPasswordResetButton"
  );

const message =
  document.querySelector("#message");

const results =
  document.querySelector("#results");

const generatedCode =
  document.querySelector(
    "#generatedCode"
  );

const copyPromoButton =
  document.querySelector(
    "#copyPromoButton"
  );

let csrf = "";
let currentPromoCode = "";
let currentUsers = [];
let resetTargetUser = null;

function showMessage(
  text,
  error = false
) {
  message.hidden = false;

  message.style.color =
    error
      ? "#ffb4ab"
      : "#8ff0a4";

  message.textContent =
    String(text || "");
}

function clearMessage() {
  message.hidden = true;
  message.textContent = "";
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
  const value =
    Number(months || 0);

  if (value === 1) {
    return "1 Month";
  }

  if (value > 1) {
    return `${value} Months`;
  }

  return "Free Plan";
}

function generateResetPassword(
  length = 16
) {
  const groups = [
    "ABCDEFGHJKLMNPQRSTUVWXYZ",
    "abcdefghijkmnopqrstuvwxyz",
    "23456789",
    "!@#$%*+-_"
  ];

  const allCharacters =
    groups.join("");

  const randomCharacter =
    characters => {
      const values =
        new Uint32Array(1);

      crypto.getRandomValues(values);

      return characters[
        values[0] %
        characters.length
      ];
    };

  const passwordCharacters =
    groups.map(randomCharacter);

  while (
    passwordCharacters.length <
    length
  ) {
    passwordCharacters.push(
      randomCharacter(
        allCharacters
      )
    );
  }

  /*
   * Secure random shuffle
   */
  for (
    let index =
      passwordCharacters.length - 1;
    index > 0;
    index--
  ) {
    const values =
      new Uint32Array(1);

    crypto.getRandomValues(values);

    const randomIndex =
      values[0] %
      (index + 1);

    [
      passwordCharacters[index],
      passwordCharacters[randomIndex]
    ] = [
      passwordCharacters[randomIndex],
      passwordCharacters[index]
    ];
  }

  return passwordCharacters.join("");
}

async function api(
  path,
  options = {}
) {
  const method =
    String(
      options.method || "GET"
    ).toUpperCase();

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
    method !== "GET"
  ) {
    headers["x-csrf-token"] =
      csrf;
  }

  const response =
    await fetch(
      `/api/${path}`,
      {
        credentials: "same-origin",
        ...options,
        method,
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

function showAdminPanels() {
  loginCard.hidden = true;
  adminCard.hidden = false;
  promoCard.hidden = false;
}

async function initialize() {
  try {
    const data =
      await api("auth/me");

    if (
      data.user?.role === "admin"
    ) {
      csrf = data.csrf || "";

      showAdminPanels();
      return;
    }

    loginCard.hidden = false;
  } catch (error) {
    loginCard.hidden = false;

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
    loginAdmin
  );

document
  .querySelector("#identity")
  .addEventListener(
    "keydown",
    event => {
      if (event.key === "Enter") {
        document
          .querySelector("#password")
          .focus();
      }
    }
  );

document
  .querySelector("#password")
  .addEventListener(
    "keydown",
    event => {
      if (event.key === "Enter") {
        loginAdmin();
      }
    }
  );

async function loginAdmin() {
  const loginButton =
    document.querySelector(
      "#loginButton"
    );

  try {
    clearMessage();

    const identity =
      document
        .querySelector("#identity")
        .value
        .trim();

    const password =
      document
        .querySelector("#password")
        .value;

    if (!identity || !password) {
      throw new Error(
        "Admin username/email နှင့် password ထည့်ပါ"
      );
    }

    loginButton.disabled = true;
    loginButton.textContent =
      "Logging in…";

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

    document
      .querySelector("#password")
      .value = "";

    showAdminPanels();

    showMessage(
      "Admin login အောင်မြင်ပါသည်"
    );
  } catch (error) {
    showMessage(
      error.message,
      true
    );
  } finally {
    loginButton.disabled = false;
    loginButton.textContent =
      "Login";
  }
}

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
  .querySelector(
    "#createPromoButton"
  )
  .addEventListener(
    "click",
    createPromoCode
  );

document
  .querySelector(
    "#generatePasswordButton"
  )
  .addEventListener(
    "click",
    () => {
      newUserPassword.value =
        generateResetPassword();

      newUserPassword.focus();
      newUserPassword.select();
    }
  );

document
  .querySelector(
    "#copyPasswordButton"
  )
  .addEventListener(
    "click",
    copyResetPassword
  );

document
  .querySelector(
    "#cancelPasswordResetButton"
  )
  .addEventListener(
    "click",
    closePasswordReset
  );

confirmPasswordResetButton
  .addEventListener(
    "click",
    resetUserPassword
  );

confirmAdminPassword
  .addEventListener(
    "keydown",
    event => {
      if (event.key === "Enter") {
        resetUserPassword();
      }
    }
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
          .writeText(
            currentPromoCode
          );

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
  const searchButton =
    document.querySelector(
      "#searchButton"
    );

  try {
    clearMessage();

    const query =
      document
        .querySelector("#search")
        .value
        .trim();

    if (
      query.length < 2
    ) {
      throw new Error(
        "အနည်းဆုံး စာလုံး 2 လုံးထည့်ပါ"
      );
    }

    searchButton.disabled = true;
    searchButton.textContent =
      "Searching…";

    const data =
      await api(
        `admin/vip-users?q=${
          encodeURIComponent(query)
        }`
      );

    currentUsers =
      data.items || [];

    renderUsers(currentUsers);
  } catch (error) {
    currentUsers = [];

    results.innerHTML = "";

    showMessage(
      error.message,
      true
    );
  } finally {
    searchButton.disabled = false;
    searchButton.textContent =
      "Search";
  }
}

function renderUsers(users) {
  if (!users.length) {
    results.innerHTML = `
      <p class="muted">
        User မတွေ့ပါ
      </p>
    `;

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
        <div
          class="user"
          data-user-id="${escapeHTML(
            user.id
          )}"
        >
          <strong>
            ${escapeHTML(
              user.username
            )}
          </strong>

          <div class="muted">
            ${escapeHTML(
              user.email
            )}
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
                ? `Active — ${
                    escapeHTML(expiry)
                  }`
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
              id="plan-${escapeHTML(
                user.id
              )}"
              aria-label="VIP plan"
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
              type="button"
              data-action="extend"
              data-id="${escapeHTML(
                user.id
              )}"
            >
              VIP ထည့်မည်
            </button>

            <button
              type="button"
              data-action="reset-device"
              data-id="${escapeHTML(
                user.id
              )}"
            >
              Device Reset
            </button>

            <button
              class="blue"
              type="button"
              data-action="reset-password"
              data-id="${escapeHTML(
                user.id
              )}"
            >
              Password Reset
            </button>

            <button
              class="danger"
              type="button"
              data-action="cancel"
              data-id="${escapeHTML(
                user.id
              )}"
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
        () => {
          const user =
            currentUsers.find(
              current =>
                String(current.id) ===
                String(
                  button.dataset.id
                )
            );

          runAction(
            user,
            button.dataset.action,
            button
          );
        }
      );
    });
}

function openPasswordReset(user) {
  if (!user) {
    showMessage(
      "Reset လုပ်မည့် user မတွေ့ပါ",
      true
    );

    return;
  }

  resetTargetUser = user;

  resetUserDetails.innerHTML = `
    <strong>
      ${escapeHTML(user.username)}
    </strong>

    <span class="muted">
      ${escapeHTML(user.email)}
    </span>
  `;

  newUserPassword.value =
    generateResetPassword();

  confirmAdminPassword.value = "";

  passwordResetCard.hidden = false;

  passwordResetCard.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

  newUserPassword.focus();
  newUserPassword.select();
}

function closePasswordReset() {
  resetTargetUser = null;

  newUserPassword.value = "";
  confirmAdminPassword.value = "";
  resetUserDetails.textContent = "";

  passwordResetCard.hidden = true;
}

async function copyResetPassword() {
  const password =
    newUserPassword.value;

  if (!password) {
    showMessage(
      "Copy လုပ်ရန် password မရှိပါ",
      true
    );

    return;
  }

  try {
    await navigator.clipboard
      .writeText(password);

    showMessage(
      "Password copy လုပ်ပြီးပါပြီ"
    );
  } catch {
    newUserPassword.focus();
    newUserPassword.select();

    showMessage(
      "Auto copy မလုပ်နိုင်ပါ။ Password ကို လက်ဖြင့် copy လုပ်ပါ။",
      true
    );
  }
}

async function resetUserPassword() {
  if (!resetTargetUser) {
    showMessage(
      "Reset လုပ်မည့် user ကို အရင်ရွေးပါ",
      true
    );

    return;
  }

  const newPassword =
    newUserPassword.value;

  const adminPassword =
    confirmAdminPassword.value;

  if (
    newPassword.length < 8 ||
    newPassword.length > 128
  ) {
    showMessage(
      "Password အသစ်ကို 8 လုံးမှ 128 လုံးအတွင်းထားပါ",
      true
    );

    return;
  }

  if (!adminPassword) {
    showMessage(
      "အတည်ပြုရန် Admin password ထည့်ပါ",
      true
    );

    confirmAdminPassword.focus();
    return;
  }

  const confirmed =
    confirm(
      `${resetTargetUser.username} ရဲ့ password ကို reset လုပ်မလား?\n\n` +
      "လက်ရှိ login sessions အားလုံး logout ဖြစ်သွားပါမည်။"
    );

  if (!confirmed) {
    return;
  }

  confirmPasswordResetButton.disabled =
    true;

  confirmPasswordResetButton.textContent =
    "Resetting…";

  try {
    const data =
      await api(
        `admin/users/${
          encodeURIComponent(
            resetTargetUser.id
          )
        }/reset-password`,
        {
          method: "POST",
          body: JSON.stringify({
            newPassword,
            adminPassword
          })
        }
      );

    /*
     * Admin password ကို DOM ထဲ
     * ဆက်မထားပါ။
     */
    confirmAdminPassword.value = "";

    showMessage(
      data.message ||
      `${resetTargetUser.username} ရဲ့ password ကို reset လုပ်ပြီးပါပြီ`
    );

    /*
     * Generated password ကို user ဆီ
     * ပေးရန် လိုသေးသောကြောင့်
     * password field ကို မဖျက်သေးပါ။
     */
    newUserPassword.focus();
    newUserPassword.select();
  } catch (error) {
    confirmAdminPassword.value = "";

    showMessage(
      error.message,
      true
    );
  } finally {
    confirmPasswordResetButton.disabled =
      false;

    confirmPasswordResetButton.textContent =
      "Confirm Password Reset";
  }
}

async function runAction(
  user,
  action,
  button
) {
  if (!user) {
    showMessage(
      "User information မတွေ့ပါ",
      true
    );

    return;
  }

  if (
    action === "reset-password"
  ) {
    openPasswordReset(user);
    return;
  }

  const originalText =
    button.textContent;

  try {
    clearMessage();

    let body = {};

    if (action === "extend") {
      const select =
        document.querySelector(
          `#plan-${
            CSS.escape(
              String(user.id)
            )
          }`
        );

      body = {
        planMonths:
          Number(select.value)
      };
    }

    if (
      action === "cancel" &&
      !confirm(
        `${user.username} ရဲ့ VIP ကို ပယ်ဖျက်မှာ သေချာပါသလား?`
      )
    ) {
      return;
    }

    if (
      action === "reset-device" &&
      !confirm(
        `${user.username} ရဲ့ device ကို reset လုပ်မလား?\n\n` +
        "User logout ဖြစ်နိုင်ပါသည်။"
      )
    ) {
      return;
    }

    button.disabled = true;
    button.textContent =
      "Processing…";

    const data =
      await api(
        `admin/vip-users/${
          encodeURIComponent(
            user.id
          )
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
    showMessage(
      error.message,
      true
    );
  } finally {
    button.disabled = false;
    button.textContent =
      originalText;
  }
}

async function createPromoCode() {
  const createButton =
    document.querySelector(
      "#createPromoButton"
    );

  try {
    clearMessage();

    const planMonths =
      Number(
        document
          .querySelector(
            "#promoPlan"
          )
          .value
      );

    const maxRedemptions =
      Number(
        document
          .querySelector(
            "#promoMaxUses"
          )
          .value
      );

    const expiresInDays =
      Number(
        document
          .querySelector(
            "#promoExpiryDays"
          )
          .value
      );

    if (
      ![1, 3, 6, 12].includes(
        planMonths
      )
    ) {
      throw new Error(
        "Promo plan မမှန်ပါ"
      );
    }

    if (
      !Number.isInteger(
        maxRedemptions
      ) ||
      maxRedemptions < 1 ||
      maxRedemptions > 1000
    ) {
      throw new Error(
        "Max uses ကို 1 မှ 1000 အတွင်းထားပါ"
      );
    }

    if (
      !Number.isInteger(
        expiresInDays
      ) ||
      expiresInDays < 1 ||
      expiresInDays > 3650
    ) {
      throw new Error(
        "Expiry days ကို 1 မှ 3650 အတွင်းထားပါ"
      );
    }

    createButton.disabled = true;
    createButton.textContent =
      "Generating…";

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
      `${data.message || "Promo Code ထုတ်ပြီးပါပြီ"}\n` +
      `Plan: ${planLabel(
        data.planMonths
      )}\n` +
      `Max uses: ${
        data.maxRedemptions
      }\n` +
      `Expired: ${
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
  } finally {
    createButton.disabled = false;
    createButton.textContent =
      "Generate Promo";
  }
}

initialize();
